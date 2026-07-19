import type { Db } from "mongodb";
import { env } from "../config/env.js";
import { configuredEmbeddingProviders, embedTextWithProvider } from "./ai.js";
import type { AiProvider, EmbeddedText } from "./aiTypes.js";

export type SemanticEvidenceResult = {
  source:
    | "atlas_vector_search"
    | "local_embedding_fallback"
    | "lexical_fallback"
    | "lexical_fallback_after_vector_error"
    | "disabled_no_ai_provider"
    | "disabled_no_gemini_key";
  embedding_provider?: AiProvider;
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

type VectorNamespace = {
  provider: AiProvider;
  collection: string;
  index: string;
  model: string;
  dimensions: number;
};

export function vectorNamespaceForProvider(provider: AiProvider): VectorNamespace {
  if (provider === "bedrock") {
    return {
      provider,
      collection: env.bedrockVectorSearchCollection,
      index: env.bedrockVectorSearchIndex,
      model: env.bedrockEmbeddingModel,
      dimensions: env.bedrockEmbeddingDimensions
    };
  }
  return {
    provider,
    collection: env.vectorSearchCollection,
    index: env.vectorSearchIndex,
    model: env.embeddingModel,
    dimensions: env.embeddingDimensions
  };
}

export async function semanticEvidenceSearch(db: Db, graph: any, query: string, limit = 5): Promise<SemanticEvidenceResult> {
  const docs = graphEvidenceDocuments(graph);
  if (!env.vectorSearchEnabled) {
    return lexicalSearch(query, docs, "lexical_fallback", limit);
  }
  const providers = configuredEmbeddingProviders();
  if (!providers.length) {
    return lexicalSearch(query, docs, "disabled_no_ai_provider", limit);
  }

  const errors: string[] = [];
  for (const provider of providers) {
    const namespace = vectorNamespaceForProvider(provider);
    try {
      const queryEmbedding = await embedTextWithProvider(provider, query, "RETRIEVAL_QUERY");
      await ensureGraphEmbeddings(db, docs, namespace);
      const searchIndex = await searchIndexHealth(db, namespace);
      if (searchIndex.status !== "ready_for_queries") {
        const localFallback = await localEmbeddingSearch(db, docs, queryEmbedding, namespace, query, limit);
        if (localFallback.results.length) {
          return localFallback;
        }
        errors.push(searchIndex.error ?? `${provider} vector search index status: ${searchIndex.status}`);
        continue;
      }
      const collection = db.collection(namespace.collection);
      const rows = await collection.aggregate([
        {
          $vectorSearch: {
            index: namespace.index,
            path: "embedding",
            queryVector: queryEmbedding.values,
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
      if (!rows.length) {
        errors.push(`${provider}: vector index returned no matching evidence`);
        continue;
      }
      return {
        source: "atlas_vector_search",
        embedding_provider: provider,
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
      errors.push(`${provider}: ${publicError(error)}`);
    }
  }

  return {
    ...lexicalSearch(query, docs, "lexical_fallback_after_vector_error", limit),
    error: errors.join("; ").slice(0, 360)
  };
}

export async function ensureVectorSearchIndexes(
  db: Db,
  providers: AiProvider[] = configuredEmbeddingProviders()
) {
  await Promise.all(providers.map(async (provider) => {
    const namespace = vectorNamespaceForProvider(provider);
    const collection = db.collection(namespace.collection);
    await Promise.all([
      collection.createIndex({ doc_id: 1, embedding_model: 1, embedding_dimensions: 1 }, { unique: true }),
      collection.createIndex({ cluster_id: 1, node_id: 1 }),
      collection.createIndex({ updated_at: -1 })
    ]);
  }));
}

export function selectedVectorIndexProviders(args: string[], configured: AiProvider[]): AiProvider[] {
  const inline = args.find((arg) => arg.startsWith("--provider="));
  const separateIndex = args.indexOf("--provider");
  const requested = inline?.slice("--provider=".length)
    ?? (separateIndex >= 0 ? args[separateIndex + 1] : undefined);
  if (!requested) return configured.slice(0, 1);
  if (requested !== "bedrock" && requested !== "gemini") {
    throw new Error(`Invalid vector provider: ${requested}`);
  }
  if (!configured.includes(requested)) {
    throw new Error(`Vector provider is not configured: ${requested}`);
  }
  return [requested];
}

export async function vectorSearchHealth(db: Db) {
  const configuredProviders = configuredEmbeddingProviders();
  const providers = await Promise.all(configuredProviders.map(async (provider) => {
    const namespace = vectorNamespaceForProvider(provider);
    const [count, searchIndex] = await Promise.all([
      db.collection(namespace.collection).estimatedDocumentCount().catch(() => 0),
      env.vectorSearchEnabled
        ? searchIndexHealth(db, namespace)
        : Promise.resolve({ status: null as null, error: null as string | null, index_exists: false })
    ]);
    return {
      ...namespace,
      atlas_status: searchIndex.status,
      index_exists: searchIndex.index_exists,
      embedded_documents: count,
      error: searchIndex.error
    };
  }));
  const primaryNamespace = providers[0] ?? vectorNamespaceForProvider(env.providerOrder[0] ?? "bedrock");
  const status = vectorRuntimeStatus(primaryNamespace.atlas_status ?? null, configuredProviders.length);
  return {
    enabled: env.vectorSearchEnabled,
    status,
    atlas_status: primaryNamespace.atlas_status ?? null,
    collection: primaryNamespace.collection,
    index: primaryNamespace.index,
    index_exists: primaryNamespace.index_exists ?? false,
    embedding_model: primaryNamespace.model,
    embedding_dimensions: primaryNamespace.dimensions,
    embedded_documents: primaryNamespace.embedded_documents ?? 0,
    embedding_provider: primaryNamespace.provider,
    providers,
    error: status === "local_embedding_fallback" ? null : primaryNamespace.error ?? null
  };
}

function vectorRuntimeStatus(status: string | null, configuredProviderCount: number) {
  if (!env.vectorSearchEnabled) return "disabled";
  if (!configuredProviderCount) return "waiting_for_ai_provider";
  return status === "ready_for_queries" ? "ready_for_queries" : "local_embedding_fallback";
}

export function isAtlasSearchUnsupported(error: unknown) {
  const code = typeof (error as any)?.code === "number" ? (error as any).code : null;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === 59 || /createSearchIndexes|listSearchIndexes|no such command|CommandNotFound/i.test(message);
}

async function searchIndexHealth(db: Db, namespace: VectorNamespace) {
  try {
    const indexes = await db.collection(namespace.collection).listSearchIndexes(namespace.index).toArray();
    return {
      status: indexes.length ? "ready_for_queries" : "index_missing",
      error: null,
      index_exists: indexes.length > 0
    };
  } catch (error) {
    if (isAtlasSearchUnsupported(error)) {
      return {
        status: "unsupported_mongodb",
        error: `Current MongoDB server does not support Atlas Search indexes. Using local ${namespace.provider} embedding similarity until MongoDB Atlas is configured.`,
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

async function ensureGraphEmbeddings(db: Db, docs: EvidenceDoc[], namespace: VectorNamespace) {
  const collection = db.collection(namespace.collection);
  for (const doc of docs.slice(0, MAX_EMBEDDING_DOCS_PER_QUERY)) {
    const existing = await collection.findOne({
      doc_id: doc.doc_id,
      embedding_model: namespace.model,
      embedding_dimensions: namespace.dimensions
    }, { projection: { _id: 1, embedding: 1 } });
    if (existing && isValidEmbeddingVector(existing.embedding, namespace.dimensions)) continue;
    const embedded = await embedTextWithProvider(namespace.provider, doc.text, "RETRIEVAL_DOCUMENT", doc.title);
    await collection.updateOne(
      { doc_id: doc.doc_id, embedding_model: namespace.model, embedding_dimensions: namespace.dimensions },
      {
        $set: {
          ...doc,
          embedding: embedded.values,
          embedding_provider: namespace.provider,
          embedding_model: namespace.model,
          embedding_dimensions: namespace.dimensions,
          updated_at: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  }
}

async function localEmbeddingSearch(
  db: Db,
  docs: EvidenceDoc[],
  queryEmbedding: EmbeddedText,
  namespace: VectorNamespace,
  query: string,
  limit: number
): Promise<SemanticEvidenceResult> {
  const docIds = docs.map((doc) => doc.doc_id);
  const rows = await db.collection(namespace.collection).find({
    doc_id: { $in: docIds },
    embedding_model: namespace.model,
    embedding_dimensions: namespace.dimensions
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
      const embedding = isValidEmbeddingVector(row.embedding, namespace.dimensions) ? row.embedding : [];
      const graphDoc = docsById.get(row.doc_id);
      if (!embedding.length || !graphDoc) return null;
      return {
        doc_id: row.doc_id,
        node_id: row.node_id ?? graphDoc.node_id,
        type: row.type ?? graphDoc.type,
        title: row.title ?? graphDoc.title,
        text: row.text ?? graphDoc.text,
        fact_ids: row.fact_ids ?? graphDoc.fact_ids,
        score: Number(Math.max(0, cosineSimilarity(queryEmbedding.values, embedding)).toFixed(3))
      };
    })
    .filter(Boolean)
    .sort((left: any, right: any) => right.score - left.score)
    .slice(0, limit);

  return {
    source: "local_embedding_fallback",
    embedding_provider: namespace.provider,
    query,
    results: results as SemanticEvidenceResult["results"]
  };
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || !left.length) return 0;
  const length = left.length;
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

export function isValidEmbeddingVector(value: unknown, dimensions: number): value is number[] {
  return Array.isArray(value)
    && value.length === dimensions
    && value.every((item) => typeof item === "number" && Number.isFinite(item));
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
