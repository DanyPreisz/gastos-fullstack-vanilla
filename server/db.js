import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI || "";
const dbName = process.env.MONGODB_DB || "gastos";
let db;

export function isReady() {
  return Boolean(db);
}

export async function connect() {
  if (!uri) throw new Error("Falta MONGODB_URI");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  db = client.db(dbName);
  await db.collection("users").createIndex({ username: 1 }, { unique: true });
  await db.collection("expenses").createIndex({ userId: 1, spentAt: -1 });
  await db.collection("expenses").createIndex({ userId: 1, category: 1 });
  console.log(`MongoDB conectado (${dbName})`);
  return db;
}

export const users = () => db.collection("users");
export const expenses = () => db.collection("expenses");

export function toId(value) {
  if (!ObjectId.isValid(value)) return null;
  return new ObjectId(String(value));
}

export function mapExpense(doc) {
  return {
    id: String(doc._id),
    title: doc.title,
    amount: doc.amount,
    category: doc.category,
    note: doc.note || "",
    spentAt: doc.spentAt,
    createdAt: doc.createdAt,
  };
}
