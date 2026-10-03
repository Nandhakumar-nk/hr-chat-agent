// Turns text into vectors, using the same Google provider as the chat
// model (src/agent.js) - no new embeddings provider needed.

import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
});

export function embedDocuments(texts) {
  return embeddings.embedDocuments(texts);
}

export function embedQuery(text) {
  return embeddings.embedQuery(text);
}
