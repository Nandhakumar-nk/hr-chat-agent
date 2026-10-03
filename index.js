import "dotenv/config";

import { runSingleShot, runInteractiveChat } from "./src/chat.js";
import { ensureIndexed } from "./src/rag/index.js";

try {
  await ensureIndexed();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

// Pass a question on the command line for a quick single-shot test:
//   node index.js "What is my sick leave balance?"
// Run with no arguments for an interactive, context-aware chat.
const question = process.argv[2];

if (question) {
  await runSingleShot(question);
} else {
  await runInteractiveChat();
}
