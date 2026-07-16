import { connectMongo, closeMongo } from "../db/mongo.js";
import { resetMongoSeed } from "../data/seed.js";

const db = await connectMongo();
const counts = await resetMongoSeed(db);
console.log(JSON.stringify({ ok: true, counts }, null, 2));
await closeMongo();
