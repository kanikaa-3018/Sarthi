import { env } from "../config/env.js";
import { closeMongo, connectMongo } from "../db/mongo.js";
import { configuredEmbeddingProviders } from "../services/ai.js";
import {
  ensureVectorSearchIndexes,
  isAtlasSearchUnsupported,
  selectedVectorIndexProviders,
  vectorNamespaceForProvider
} from "../services/vectorSearch.js";

const db = await connectMongo();
try {
  if (!env.vectorSearchEnabled) {
    console.log("VECTOR_SEARCH_ENABLED=false; skipping Atlas Vector Search index creation. Set it to true only when MONGODB_URI points to MongoDB Atlas.");
  } else {
    const providers = selectedVectorIndexProviders(
      process.argv.slice(2),
      configuredEmbeddingProviders()
    );
    if (!providers.length) {
      console.log("No AI embedding provider is configured; skipping vector index creation.");
    } else {
      await ensureVectorSearchIndexes(db, providers);
      for (const provider of providers) {
        const namespace = vectorNamespaceForProvider(provider);
        const collection = db.collection(namespace.collection);
        const existing = await collection.listSearchIndexes(namespace.index).toArray();

        if (existing.length) {
          console.log(`Vector search index already exists: ${namespace.index}`);
        } else {
          const name = await collection.createSearchIndex({
            name: namespace.index,
            type: "vectorSearch",
            definition: {
              fields: [
                {
                  type: "vector",
                  path: "embedding",
                  numDimensions: namespace.dimensions,
                  similarity: "cosine"
                },
                {
                  type: "filter",
                  path: "cluster_id"
                }
              ]
            }
          });
          console.log(`Created ${provider} vector search index: ${name}`);
        }
      }
    }
  }
} catch (error) {
  if (!isAtlasSearchUnsupported(error)) throw error;
  console.warn([
    "Atlas Vector Search index was not created.",
    "Your current MongoDB server does not support createSearchIndexes/listSearchIndexes.",
    "Use MongoDB Atlas for managed vector search, or continue locally with API-side embedding similarity.",
    "Sarthi will continue without blocking the buyer/admin demo."
  ].join(" "));
} finally {
  await closeMongo();
}
