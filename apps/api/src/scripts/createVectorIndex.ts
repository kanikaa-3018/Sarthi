import { env } from "../config/env.js";
import { closeMongo, connectMongo } from "../db/mongo.js";
import { ensureVectorSearchIndexes, isAtlasSearchUnsupported } from "../services/vectorSearch.js";

const db = await connectMongo();
try {
  if (!env.vectorSearchEnabled) {
    console.log("VECTOR_SEARCH_ENABLED=false; skipping Atlas Vector Search index creation. Set it to true only when MONGODB_URI points to MongoDB Atlas.");
  } else {
  await ensureVectorSearchIndexes(db);
  const collection = db.collection(env.vectorSearchCollection);
  const existing = await collection.listSearchIndexes(env.vectorSearchIndex).toArray();

  if (existing.length) {
    console.log(`Vector search index already exists: ${env.vectorSearchIndex}`);
  } else {
    const name = await collection.createSearchIndex({
      name: env.vectorSearchIndex,
      type: "vectorSearch",
      definition: {
        fields: [
          {
            type: "vector",
            path: "embedding",
            numDimensions: env.embeddingDimensions,
            similarity: "cosine"
          },
          {
            type: "filter",
            path: "cluster_id"
          }
        ]
      }
    });
    console.log(`Created vector search index: ${name}`);
  }
  }
} catch (error) {
  if (!isAtlasSearchUnsupported(error)) throw error;
  console.warn([
    "Atlas Vector Search index was not created.",
    "Your current MongoDB server does not support createSearchIndexes/listSearchIndexes.",
    "Use MongoDB Atlas for vector search, or set VECTOR_SEARCH_ENABLED=false for local demo.",
    "Sarthi will continue with lexical fallback search."
  ].join(" "));
} finally {
  await closeMongo();
}
