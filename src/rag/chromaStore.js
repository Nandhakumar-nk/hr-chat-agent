// Thin wrapper around the chromadb client - the one new piece of real
// infrastructure this project has (Chroma runs as a separate server
// process: `npx chroma run --path ./data/chroma`). Written directly
// against `chromadb`'s ChromaClient rather than @langchain/community's
// `Chroma` vector store class, which wraps the same client but was just
// deprecated/sunset by the LangChain team.

import { ChromaClient } from "chromadb";

import { embedDocuments } from "./embeddings.js";

const CHROMA_URL = process.env.CHROMA_URL ?? "http://localhost:8000";
const COLLECTION_NAME = "hr-policies";

const { hostname, port, protocol } = new URL(CHROMA_URL);
const client = new ChromaClient({
  host: hostname,
  port: Number(port),
  ssl: protocol === "https:",
});

// We always pass precomputed embeddings ourselves (see index.js/addChunks
// below), but Chroma still wants a collection-level embedding function to
// fall back on; without one it tries to load its own default and warns.
// Wiring it to our own embedDocuments keeps it consistent (and quiet).
const embeddingFunction = { name: "gemini-embeddings", generate: embedDocuments };

async function getCollection() {
  return client.getOrCreateCollection({ name: COLLECTION_NAME, embeddingFunction });
}

export async function countChunks() {
  try {
    const collection = await getCollection();
    return await collection.count();
  } catch (error) {
    throw new Error(
      `Could not reach the Chroma server at ${CHROMA_URL}. Start it first:\n` +
        `  npx chroma run --path ./data/chroma\n` +
        `(original error: ${error.message})`
    );
  }
}

// chunks: [{ id, text, embedding, metadata }]
export async function addChunks(chunks) {
  const collection = await getCollection();
  await collection.add({
    ids: chunks.map((c) => c.id),
    embeddings: chunks.map((c) => c.embedding),
    documents: chunks.map((c) => c.text),
    metadatas: chunks.map((c) => c.metadata),
  });
}

// Returns the top `k` chunks by similarity to `queryEmbedding`.
export async function queryChunks(queryEmbedding, k) {
  const collection = await getCollection();
  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: k,
  });

  const documents = result.documents[0] ?? [];
  const metadatas = result.metadatas[0] ?? [];

  return documents.map((text, i) => ({
    text,
    source: metadatas[i]?.source,
    file: metadatas[i]?.file,
    page: metadatas[i]?.page,
  }));
}
