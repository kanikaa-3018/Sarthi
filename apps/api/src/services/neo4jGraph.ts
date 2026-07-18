import neo4j, { type Driver } from "neo4j-driver";
import { env } from "../config/env.js";

let driver: Driver | null = null;
let neo4jDisabledUntil = 0;

type ProjectionStatus = {
  enabled: boolean;
  status: "disabled" | "projected" | "unavailable";
  engine: "mongodb_projection" | "neo4j_projection";
  projected_nodes?: number;
  projected_edges?: number;
  error?: string;
};

export async function projectGraphToNeo4j(graph: any): Promise<ProjectionStatus> {
  if (!env.neo4jEnabled) {
    return { enabled: false, status: "disabled", engine: "mongodb_projection" };
  }
  if (neo4jCircuitOpen()) {
    return { enabled: true, status: "unavailable", engine: "mongodb_projection", error: "Neo4j temporarily skipped after a recent connection failure" };
  }
  try {
    const db = getNeo4jDriver();
    const nodes = graph.nodes.map((node: any) => ({
      id: node.id,
      props: {
        id: node.id,
        type: node.type,
        label: node.label,
        subtitle: node.subtitle,
        status: node.status,
        score: typeof node.score === "number" ? node.score : null,
        fact_ids: node.fact_ids ?? [],
        cluster_id: graph.cluster.cluster_id,
        buyer_scope: node.type === "buyer_context" ? "private" : "aggregate"
      }
    }));
    const edges = graph.edges.map((edge: any) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      weight: edge.weight,
      fact_ids: edge.fact_ids ?? [],
      cluster_id: graph.cluster.cluster_id
    }));

    await withTimeout(db.executeQuery(
      `
      MERGE (g:EvidenceGraph {cluster_id: $cluster_id})
      SET g.label = $cluster_label,
          g.category = $category,
          g.updated_at = datetime()
      WITH g
      UNWIND $nodes AS node
      MERGE (n:EvidenceNode {id: node.id})
      SET n += node.props
      MERGE (g)-[:HAS_NODE]->(n)
      `,
      {
        cluster_id: graph.cluster.cluster_id,
        cluster_label: graph.cluster.label,
        category: graph.cluster.category,
        nodes
      }
    ));

    await withTimeout(db.executeQuery(
      `
      UNWIND $edges AS edge
      MATCH (source:EvidenceNode {id: edge.source})
      MATCH (target:EvidenceNode {id: edge.target})
      MERGE (source)-[rel:EVIDENCE_LINK {id: edge.id}]->(target)
      SET rel.label = edge.label,
          rel.weight = edge.weight,
          rel.fact_ids = edge.fact_ids,
          rel.cluster_id = edge.cluster_id,
          rel.updated_at = datetime()
      `,
      { edges }
    ));

    return {
      enabled: true,
      status: "projected",
      engine: "neo4j_projection",
      projected_nodes: nodes.length,
      projected_edges: edges.length
    };
  } catch (error) {
    tripNeo4jCircuit();
    return {
      enabled: true,
      status: "unavailable",
      engine: "mongodb_projection",
      error: publicError(error)
    };
  }
}

export async function neo4jHealth() {
  if (!env.neo4jEnabled) return { enabled: false, status: "disabled" as const };
  if (neo4jCircuitOpen()) {
    return { enabled: true, status: "unavailable" as const, error: "Neo4j temporarily skipped after a recent connection failure" };
  }
  try {
    await withTimeout(getNeo4jDriver().executeQuery("RETURN 1 AS ok"));
    return { enabled: true, status: "connected" as const };
  } catch (error) {
    tripNeo4jCircuit();
    return { enabled: true, status: "unavailable" as const, error: publicError(error) };
  }
}

function getNeo4jDriver() {
  if (driver) return driver;
  if (!env.neo4jUri || !env.neo4jUsername || !env.neo4jPassword) {
    throw new Error("Neo4j credentials are incomplete");
  }
  driver = neo4j.driver(env.neo4jUri, neo4j.auth.basic(env.neo4jUsername, env.neo4jPassword), {
    connectionTimeout: env.externalServiceTimeoutMs,
    connectionAcquisitionTimeout: env.externalServiceTimeoutMs,
    maxConnectionPoolSize: 10
  });
  return driver;
}

function publicError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 180) : "Neo4j projection failed";
}

function neo4jCircuitOpen() {
  return Date.now() < neo4jDisabledUntil;
}

function tripNeo4jCircuit() {
  neo4jDisabledUntil = Date.now() + 60_000;
}

async function withTimeout<T>(promise: Promise<T>) {
  let timeout: NodeJS.Timeout | undefined;
  const timer = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error("Neo4j request timed out")), env.externalServiceTimeoutMs);
  });
  try {
    return await Promise.race([promise, timer]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
