// Presentation layer: the two ways a person interacts with the agent.
// Both just call src/agent.js's runAgentTurn - no tool or model logic
// lives here.

import { createInterface } from "node:readline/promises";

import { SYSTEM_PROMPT, runAgentTurn } from "./agent.js";

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
