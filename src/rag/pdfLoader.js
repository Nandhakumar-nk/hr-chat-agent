// Loads a PDF into one LangChain Document per page. Written directly
// against `pdf-parse` rather than @langchain/community's PDFLoader,
// which wraps the same thing but was just deprecated/sunset by the
// LangChain team (no replacement package exists yet for it).

import { readFile } from "node:fs/promises";
import { PDFParse } from "pdf-parse";
import { Document } from "@langchain/core/documents";

export async function loadPdfPages(filePath) {
  const buffer = await readFile(filePath);
  const parser = new PDFParse({ data: buffer });
  const result = await parser.getText();
  await parser.destroy();

  return result.pages.map(
    (page) =>
      new Document({
        pageContent: page.text,
        metadata: { source: filePath, page: page.num },
      })
  );
}
