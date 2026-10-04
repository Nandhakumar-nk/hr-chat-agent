// Presentation layer: the two ways a person interacts with the agent.
// Both just call src/agent.js's runAgentTurn - no tool or model logic
// lives here.

import { createInterface } from "node:readline/promises";

import { SYSTEM_PROMPT, runAgentTurn } from "./agent.js";
import { login } from "./session.js";

// Queues every 'line' event as it arrives, instead of attaching a
// one-shot listener per question like rl.question() does. Needed here
// specifically: promptLogin asks two questions back-to-back with no
// async work in between (unlike the chat loop below, where an LLM call
// separates each question). If both answers arrive before the second
// question is even asked - fast typing, or a paste of both lines at
// once - rl.question()'s listener for the second question isn't
// attached yet, and that line's 'line' event fires with nothing
// listening and is silently lost, hanging the prompt forever. Queuing
// every line as it arrives (not just when asked for) makes this
// correct regardless of timing.
function createLineQueue(rl) {
  const queued = [];
  const waiters = [];
  rl.on("line", (line) => {
    if (waiters.length) waiters.shift()(line);
    else queued.push(line);
  });
  return () =>
    queued.length ? Promise.resolve(queued.shift()) : new Promise((resolve) => waiters.push(resolve));
}

// Interactive login prompt, used by index.js when no --as/--password
// flags were given. Plain visible input (no masking) - this is a
// demo-only credential (src/session.js), not real security, so the
// extra complexity of hiding keystrokes isn't worth it here.
export async function promptLogin() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const nextLine = createLineQueue(rl);
  try {
    process.stdout.write("Employee ID: ");
    const employeeId = (await nextLine()).trim();
    process.stdout.write("Password: ");
    const password = (await nextLine()).trim();
    const employee = login(employeeId, password);
    console.log(`Logged in as ${employee.name} (${employee.id}).\n`);
  } finally {
    rl.close();
  }
}

// Single-shot mode: node index.js "question"
// Asks one question and exits. Handy for quick, scripted tests that
// don't burn through a whole chat session.
export async function runSingleShot(question) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  console.log(`\nYou: ${question}`);

  const response = await runAgentTurn(messages);

  console.log("\nHR Agent:");
  console.log(response.text);
}

// Interactive chat mode: node index.js (no argument)
// Keeps one `messages` array for the whole session, so later turns can
// refer back to earlier ones (context handling) - e.g. "What about sick
// leave?" after already asking about casual leave.
export async function runInteractiveChat() {
  const messages = [{ role: "system", content: SYSTEM_PROMPT }];

  console.log("HR Chat Agent - type your question, or 'exit' to quit.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  while (true) {
    const question = (await rl.question("You: ")).trim();

    if (!question || ["exit", "quit"].includes(question.toLowerCase())) {
      break;
    }

    messages.push({ role: "user", content: question });

    const response = await runAgentTurn(messages);

    console.log("\nHR Agent:");
    console.log(response.text, "\n");
  }

  rl.close();
}
