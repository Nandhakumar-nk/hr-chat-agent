import "dotenv/config";

import { runSingleShot, runInteractiveChat, promptLogin } from "./src/chat.js";
import { ensureIndexed } from "./src/rag/index.js";
import { login } from "./src/session.js";

try {
  await ensureIndexed();
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

// Pull --as=EMPxxx and --password=... out of argv; whatever's left (if
// anything) is the single-shot question.
//   node index.js "question"                          single-shot, default login
//   node index.js --as=EMP002 --password=... "question" single-shot, as another employee
//   node index.js                                      interactive, prompts for login
//   node index.js --as=EMP002 --password=...           interactive, skips the prompt
let as;
let password;
let question;
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--as=")) {
    as = arg.slice("--as=".length);
  } else if (arg.startsWith("--password=")) {
    password = arg.slice("--password=".length);
  } else if (!question) {
    question = arg;
  }
}

try {
  if (as || password) {
    login(as, password);
  } else if (question) {
    // Single-shot mode's whole purpose is quick, non-interactive tests
    // (step 3), so it defaults to the same employee every earlier step's
    // examples used, rather than prompting.
    login("EMP001", "asha123");
  } else {
    await promptLogin();
  }
} catch (error) {
  console.error(`\n${error.message}\n`);
  process.exit(1);
}

if (question) {
  await runSingleShot(question);
} else {
  await runInteractiveChat();
}
