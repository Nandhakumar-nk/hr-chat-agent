// RAG layer: indexes docs/policies/leave-policy.pdf into Chroma once,
// and retrieves the most relevant chunks for a query. Tools
// (src/tools/index.js) call only ensureIndexed/retrieve from here -
// never the PDF loader, embeddings, or Chroma client directly.
//
// Pipeline: PDF -> one Document per page -> RecursiveCharacterTextSplitter
// (chunks, page number preserved in metadata) -> embeddings -> Chroma.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { loadPdfPages } from "./pdfLoader.js";
import { embedDocuments, embedQuery } from "./embeddings.js";
import { countChunks, addChunks, queryChunks } from "./chromaStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICY_PDF_PATH = path.join(__dirname, "..", "..", "docs", "policies", "leave-policy.pdf");

export async function ensureIndexed() {
  const existing = await countChunks();
  if (existing > 0) {
    return; // already indexed from a previous run
  }

  console.log("Indexing the HR leave policy PDF (first run only)...");

  const pages = await loadPdfPages(POLICY_PDF_PATH);

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });
  const chunks = await splitter.splitDocuments(pages);

  const embeddings = await embedDocuments(chunks.map((c) => c.pageContent));

  await addChunks(
    chunks.map((chunk, i) => ({
      id: `leave-policy-${i}`,
      text: chunk.pageContent,
      embedding: embeddings[i],
      metadata: { page: chunk.metadata.page },
    }))
  );

  console.log(`Indexed ${chunks.length} chunks from ${pages.length} pages.`);
}

export async function retrieve(query, k = 3) {
  const queryEmbedding = await embedQuery(query);
  return queryChunks(queryEmbedding, k);
}
