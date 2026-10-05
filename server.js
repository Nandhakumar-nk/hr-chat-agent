import "dotenv/config";

import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";
import cors from "cors";

import { router } from "./src/server/routes.js";
import { ensureIndexed } from "./src/rag/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

try {
  await ensureIndexed();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

// This is a pure API - it never serves the frontend's files. The
// frontend (client/) is its own deployable artifact, always a separate
// process: `npm run dev` for local development, `npm run build && npm
// run preview` for a production-like standalone run. See README's
// "Running the web UI" section.
const app = express();

// Unset -> true -> any origin allowed (fine for local development, where
// both processes run on localhost). Set CORS_ORIGIN (comma-separated for
// more than one) to the frontend's real origin once deployed anywhere
// that isn't just "developer's own machine".
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") ?? true }));
app.use(express.json());
app.use("/api", router);

// Serves the already-redacted, already-committed policy PDFs so the chat
// UI's Sources links (client/src/Sources.tsx) can open the real source
// document at the cited page - not employee data, so no auth needed.
app.use("/policies", express.static(path.join(__dirname, "docs", "policies")));

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`HR Chat Agent API listening on http://localhost:${port}`);
});
