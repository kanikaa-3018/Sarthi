import type { Db } from "mongodb";
import { env } from "../config/env.js";
import { embedText, geminiConfigured } from "./gemini.js";

export type SemanticEvidenceResult = {
  source:
    | "atlas_vector_search"
    | "local_embedding_fallback"
    | "lexical_fallback"
    | "lexical_fallback_after_vector_error"
    | "disabled_no_gemini_key";
  query: string;
  results: Array<{
    doc_id: string;
    node_id: string;
    type: string;
    title: string;
    text: string;
    fact_ids: string[];
    score: number;
  }>;
  error?: string;
};

type EvidenceDoc = {
  doc_id: string;
  cluster_id: string;
  node_id: string;
  type: string;
  title: string;
  text: string;
  fact_ids: string[];
};

const MAX_EMBEDDING_DOCS_PER_QUERY = 16;

export async function semanticEvidenceSearch(db: Db, graph: any, query: string, limit = 5): Promise<SemanticEvidenceResult> {
  const docs = graphEvidenceDocuments(graph);
  if (!env.vectorSearchEnabled) {
    return lexicalSearch(query, docs, "lexical_fallback", limit);
  }
  if (!geminiConfigured()) {
    return lexicalSearch(query, docs, "disabled_no_gemini_key", limit);
  }

  try {
    const queryVector = await embedText(query, "RETRIEVAL_QUERY");
    if (!queryVector?.length) {
      return lexicalSearch(query, docs, "disabled_no_gemini_key", limit);
    }
    await ensureGraphEmbeddings(db, docs);
    const searchIndex = await searchIndexHealth(db);
    if (searchIndex.status !== "ready_for_queries") {
      const localFallback = await localEmbeddingSearch(db, docs, queryVector, query, limit);
      if (localFallback.results.length) {
        return localFallback;
      }
      return {
        ...lexicalSearch(query, docs, "lexical_fallback_after_vector_error", limit),
        error: searchIndex.error ?? `Vector search index status: ${searchIndex.status}`
      };
    }
    const collection = db.collection(env.vectorSearchCollection);
    const rows = await collection.aggregate([
      {
        $vectorSearch: {
          index: env.vectorSearchIndex,
          path: "embedding",
          queryVector,
          numCandidates: Math.max(40, limit * 20),
          limit,
          filter: { cluster_id: graph.cluster.cluster_id }
        }
      },
      {
        $project: {
          _id: 0,
          doc_id: 1,
          node_id: 1,
          type: 1,
          title: 1,
          text: 1,
          fact_ids: 1,
          score: { $meta: "vectorSearchScore" }
        }
      }
    ]).toArray();
    return {
      source: "atlas_vector_search",
      query,
      results: rows.map((row: any) => ({
        doc_id: row.doc_id,
        node_id: row.node_id,
        type: row.type,
        title: row.title,
        text: row.text,
        fact_ids: row.fact_ids ?? [],
        score: Number((row.score ?? 0).toFixed(3))
      }))
    };
  } catch (error) {
    return {
      ...lexicalSearch(query, docs, "lexical_fallback_after_vector_error", limit),
      error: publicError(error)
    };
  }
}

export async function ensureVectorSearchIndexes(db: Db) {
  const collection = db.collection(env.vectorSearchCollection);
  await Promise.all([
    collection.createIndex({ doc_id: 1, embedding_model: 1, embedding_dimensions: 1 }, { unique: true }),
    collection.createIndex({ cluster_id: 1, node_id: 1 }),
    collection.createIndex({ updated_at: -1 })
  ]);
}

export async function vectorSearchHealth(db: Db) {
  const count = await db.collection(env.vectorSearchCollection).estimatedDocumentCount().catch(() => 0);
  const searchIndex = env.vectorSearchEnabled && geminiConfigured()
    ? await searchIndexHealth(db)
    : { status: null as null, error: null as string | null, index_exists: false };
  const status = vectorRuntimeStatus(searchIndex.status);
  return {
    enabled: env.vectorSearchEnabled,
    status,
    atlas_status: searchIndex.status,
    collection: env.vectorSearchCollection,
    index: env.vectorSearchIndex,
    index_exists: searchIndex.index_exists,
    embedding_model: env.embeddingModel,
    embedding_dimensions: env.embeddingDimensions,
    embedded_documents: count,
    error: status === "local_embedding_fallback" ? null : searchIndex.error
  };
}

function vectorRuntimeStatus(status: string | null) {
  if (!env.vectorSearchEnabled) return "disabled";
  if (!geminiConfigured()) return "waiting_for_gemini_key";
  return status === "ready_for_queries" ? "ready_for_queries" : "local_embedding_fallback";
}

export function isAtlasSearchUnsupported(error: unknown) {
  const code = typeof (error as any)?.code === "number" ? (error as any).code : null;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === 59 || /createSearchIndexes|listSearchIndexes|no such command|CommandNotFound/i.test(message);
}

async function searchIndexHealth(db: Db) {
  try {
    const indexes = await db.collection(env.vectorSearchCollection).listSearchIndexes(env.vectorSearchIndex).toArray();
    return {
      status: indexes.length ? "ready_for_queries" : "index_missing",
      error: null,
      index_exists: indexes.length > 0
    };
  } catch (error) {
    if (isAtlasSearchUnsupported(error)) {
      return {
        status: "unsupported_mongodb",
        error: "Current MongoDB server does not support Atlas Search indexes. Using local Gemini embedding similarity until MongoDB Atlas is configured.",
        index_exists: false
      };
    }
    return {
      status: "unavailable",
      error: publicError(error),
      index_exists: false
    };
  }
}

function graphEvidenceDocuments(graph: any): EvidenceDoc[] {
  const nodeDocs = graph.nodes
    .filter((node: any) => node.type !== "buyer_context")
    .map((node: any) => ({
      doc_id: `${graph.cluster.cluster_id}:${node.id}`,
      cluster_id: graph.cluster.cluster_id,
      node_id: node.id,
      type: node.type,
      title: node.label,
      text: [
        `${node.type}: ${node.label}`,
        node.subtitle,
        `status: ${node.status}`,
        typeof node.score === "number" ? `score: ${node.score}` : "",
        summarizeNodeData(node.data)
      ].filter(Boolean).join(". "),
      fact_ids: node.fact_ids ?? []
    }));
  const nodesById = new Map(graph.nodes.map((node: any) => [node.id, node]));
  const edgeDocs = graph.edges.map((edge: any) => {
    const source = nodesById.get(edge.source) as any;
    const target = nodesById.get(edge.target) as any;
    const sourceLabel = source?.label ?? edge.source;
    const targetLabel = target?.label ?? edge.target;
    return {
      doc_id: `${graph.cluster.cluster_id}:${edge.id}`,
      cluster_id: graph.cluster.cluster_id,
      node_id: edge.id,
      type: "relationship",
      title: `${sourceLabel} -> ${targetLabel}`,
      text: [
        `relationship: ${sourceLabel} ${edge.label} ${targetLabel}`,
        `source type: ${source?.type ?? "unknown"}`,
        `target type: ${target?.type ?? "unknown"}`,
        `weight: ${edge.weight}`
      ].join(". "),
      fact_ids: edge.fact_ids ?? []
    };
  });
  return [...nodeDocs, ...edgeDocs];
}

async function ensureGraphEmbeddings(db: Db, docs: EvidenceDoc[]) {
  const collection = db.collection(env.vectorSearchCollection);
  for (const doc of docs.slice(0, MAX_EMBEDDING_DOCS_PER_QUERY)) {
    const existing = await collection.findOne({
      doc_id: doc.doc_id,
      embedding_model: env.embeddingModel,
      embedding_dimensions: env.embeddingDimensions
    }, { projection: { _id: 1 } });
    if (existing) continue;
    const embedding = await embedText(doc.text, "RETRIEVAL_DOCUMENT", doc.title);
    if (!embedding?.length) continue;
    await collection.updateOne(
      { doc_id: doc.doc_id, embedding_model: env.embeddingModel, embedding_dimensions: env.embeddingDimensions },
      {
        $set: {
          ...doc,
          embedding,
          embedding_model: env.embeddingModel,
          embedding_dimensions: env.embeddingDimensions,
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }
}

async function localEmbeddingSearch(db: Db, docs: EvidenceDoc[], queryVector: number[], query: string, limit: number): Promise<SemanticEvidenceResult> {
  const docIds = docs.map((doc) => doc.doc_id);
  const rows = await db.collection(env.vectorSearchCollection).find({
    doc_id: { $in: docIds },
    embedding_model: env.embeddingModel,
    embedding_dimensions: env.embeddingDimensions
  }, {
    projection: {
      _id: 0,
      doc_id: 1,
      node_id: 1,
      type: 1,
      title: 1,
      text: 1,
      fact_ids: 1,
      embedding: 1
    }
  }).toArray();

  const docsById = new Map(docs.map((doc) => [doc.doc_id, doc]));
  const results = rows
    .map((row: any) => {
      const embedding = Array.isArray(row.embedding) ? row.embedding.map(Number).filter(Number.isFinite) : [];
      const graphDoc = docsById.get(row.doc_id);
      if (!embedding.length || !graphDoc) return null;
      return {
        doc_id: row.doc_id,
        node_id: row.node_id ?? graphDoc.node_id,
        type: row.type ?? graphDoc.type,
        title: row.title ?? graphDoc.title,
        text: row.text ?? graphDoc.text,
        fact_ids: row.fact_ids ?? graphDoc.fact_ids,
        score: Number(Math.max(0, cosineSimilarity(queryVector, embedding)).toFixed(3))
      };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, limit);

  return { source: "local_embedding_fallback", query, results: results as SemanticEvidenceResult["results"] };
}

function cosineSimilarity(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function lexicalSearch(
  query: string,
  docs: EvidenceDoc[],
  source: SemanticEvidenceResult["source"],
  limit: number
): SemanticEvidenceResult {
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2);
  const scored = docs.map((doc) => {
    const haystack = `${doc.type} ${doc.title} ${doc.text}`.toLowerCase();
    const tokenHits = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
    const typeBoost = ["seller", "sku", "return_reason", "proof", "offer", "reviews"].includes(doc.type) ? 0.15 : 0;
    return { doc, score: tokenHits / Math.max(1, tokens.length) + typeBoost };
  });
  return {
    source,
    query,
    results: scored
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map(({ doc, score }) => ({
        ...doc,
        score: Number(Math.min(1, score).toFixed(3))
      }))
  };
}

function summarizeNodeData(data: Record<string, any> = {}) {
  const shallow = Object.entries(data)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 6)
    .map(([key, value]) => `${key}: ${value}`);
  return shallow.join(", ");
}

function publicError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "Vector search failed";
}
