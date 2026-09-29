import { MongoClient, type Db } from "mongodb";

declare global {
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

// Lazily connect so `next build` doesn't need MONGODB_URI, and reuse one client
// per server instance (and across hot reloads in dev).
function clientPromise(): Promise<MongoClient> {
  if (!global._mongoClientPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error("MONGODB_URI is not configured.");
    global._mongoClientPromise = new MongoClient(uri).connect();
  }
  return global._mongoClientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise();
  return client.db(process.env.MONGODB_DB || "formatassist");
}

export async function closeDb(): Promise<void> {
  if (global._mongoClientPromise) {
    const client = await global._mongoClientPromise;
    await client.close();
    global._mongoClientPromise = undefined;
  }
}
