// RAG layer: indexes all docs/policies/ PDFs into Chroma once, and
// retrieves the most relevant chunks for a query. Tools
// (src/tools/index.js) call only ensureIndexed/retrieve from here -
// never the PDF loader, embeddings, or Chroma client directly.
//
// Pipeline, per document: PDF -> one Document per page ->
// RecursiveCharacterTextSplitter (chunks, page number preserved in
// metadata) -> embeddings -> Chroma, tagged with a `source` display name
// and the original `file` (for linking back to the PDF) so citations and
// chunk IDs don't collide across documents.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { loadPdfPages } from "./pdfLoader.js";
import { embedDocuments, embedQuery } from "./embeddings.js";
import { countChunks, addChunks, queryChunks } from "./chromaStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const POLICIES_DIR = path.join(__dirname, "..", "..", "docs", "policies");

// holiday-list-2026.pdf is deliberately not here - it's hand-seeded into
// the holidays table (src/db/seed.js), not retrieved via RAG.
//
// Exported for the Policies tab (src/server/routes.js's GET /policies) -
// the single source of truth for which PDFs exist, so the frontend never
// hand-duplicates this list.
export const POLICY_DOCUMENTS = [
  {
    file: "leave-policy.pdf",
    source: "Leave Policy",
    idPrefix: "leave-policy",
    description: "Casual/Sick/Earned/Privilege leave rules, carry-forward, and encashment.",
  },
  {
    file: "Employee Benefits Policy - Newly Wed_Newborn.pdf",
    source: "Employee Benefits Policy",
    idPrefix: "employee-benefits",
    description: "Wedding and newborn gift vouchers.",
  },
  {
    file: "Staff Loan Policy - 2025.pdf",
    source: "Staff Loan Policy",
    idPrefix: "staff-loan",
    description: "Staff loan eligibility, amounts, and repayment terms.",
  },
  {
    file: "Work from Home - Hybrid Policy.pdf",
    source: "Work from Home Policy",
    idPrefix: "wfh-policy",
    description: "WFH/hybrid eligibility and the weekly day quota.",
  },
];

export async function ensureIndexed() {
  const existing = await countChunks();
  if (existing > 0) {
    return; // already indexed from a previous run
  }

  console.log("Indexing the HR policy PDFs (first run only)...");

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 150,
  });

  let totalChunks = 0;
  for (const { file, source, idPrefix } of POLICY_DOCUMENTS) {
    const pages = await loadPdfPages(path.join(POLICIES_DIR, file));
    const chunks = await splitter.splitDocuments(pages);
    const embeddings = await embedDocuments(chunks.map((c) => c.pageContent));

    await addChunks(
      chunks.map((chunk, i) => ({
        id: `${idPrefix}-${i}`,
        text: chunk.pageContent,
        embedding: embeddings[i],
        metadata: { source, file, page: chunk.metadata.page },
      }))
    );

    console.log(`Indexed ${chunks.length} chunks from ${pages.length} pages of ${source}.`);
    totalChunks += chunks.length;
  }

  console.log(`Indexed ${totalChunks} chunks total from ${POLICY_DOCUMENTS.length} documents.`);
}

export async function retrieve(query, k = 3) {
  const queryEmbedding = await embedQuery(query);
  return queryChunks(queryEmbedding, k);
}
