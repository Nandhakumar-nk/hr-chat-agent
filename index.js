import "dotenv/config";

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

// -------------------------
// 1. Create our HR tool
// -------------------------

const getLeaveBalance = tool(
  async ({ employeeId }) => {
    console.log("\n🛠 getLeaveBalance tool executed");

    // Hardcoded for now.
    // Later this will come from SQL.
    return JSON.stringify({
      employeeId,
      casualLeave: 5,
      sickLeave: 8,
    });
  },
  {
    name: "get_leave_balance",

    description:
      "Get the current casual leave and sick leave balance of an employee.",

    schema: z.object({
      employeeId: z.string(),
    }),
  }
);

// -------------------------
// 2. Create LLM
// -------------------------

const model = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});

// -------------------------
// 3. Give tools to LLM
// -------------------------

const modelWithTools = model.bindTools([getLeaveBalance]);

// -------------------------
// 4. User question
// -------------------------

// Pass a question on the command line to experiment:
//   node index.js "What is my sick leave balance?"
const question = process.argv[2] ?? "How many leaves do I have?";

const messages = [
  {
    role: "system",
    content: `
You are an HR assistant.

The authenticated employee ID is EMP001.

Use the available tools whenever employee-specific
information is required.
`,
  },
  {
    role: "user",
    content: question,
  },
];

console.log(`\nYou: ${question}`);

// -------------------------
// 5. Ask LLM
// -------------------------

const response = await modelWithTools.invoke(messages);

console.log("\nLLM decision:");
console.log(response.tool_calls);

// -------------------------
// 6. Execute requested tools
// -------------------------

messages.push(response);

for (const toolCall of response.tool_calls ?? []) {
  if (toolCall.name === "get_leave_balance") {
    const result = await getLeaveBalance.invoke(toolCall.args);

    console.log("\nTool result:");
    console.log(result);

    messages.push(
      new ToolMessage({
        content: result,
        tool_call_id: toolCall.id,
      })
    );
  }
}

// -------------------------
// 7. Give result back to LLM
// -------------------------

// If no tool was called, the first response already is the answer.
const finalResponse = response.tool_calls?.length
  ? await modelWithTools.invoke(messages)
  : response;

console.log("\nHR Agent:");
console.log(finalResponse.text);
