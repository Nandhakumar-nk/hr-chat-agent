// Orchestration layer: creates the LLM, binds the tools to it, and runs
// one agent turn (ask -> run any requested tools -> ask again, until the
// model stops calling tools). src/chat.js calls runAgentTurn once per
// user turn; it never talks to the model or the tools directly.

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ToolMessage } from "@langchain/core/messages";

import { toolsByName } from "./tools/index.js";

const model = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});

const modelWithTools = model.bindTools(Object.values(toolsByName));

export const SYSTEM_PROMPT = `
You are an HR assistant.

The authenticated employee ID is EMP001.

Use the available tools whenever employee-specific
information, leave policy rules, or date calculations
are required. You may call more than one tool, one
after another, if the question needs it.
`;

// `messages` is mutated in place (the caller's array grows with this
// turn's user message, any tool calls/results, and the final answer), so
// the same array can be reused across turns to keep the whole
// conversation in context.
export async function runAgentTurn(messages) {
  let response = await modelWithTools.invoke(messages);

  while (response.tool_calls?.length) {
    console.log("\nLLM decision:");
    console.log(response.tool_calls);

    messages.push(response);

    for (const toolCall of response.tool_calls) {
      const toolToRun = toolsByName[toolCall.name];
      const result = await toolToRun.invoke(toolCall.args);

      console.log("\nTool result:");
      console.log(result);

      messages.push(
        new ToolMessage({
          content: result,
          tool_call_id: toolCall.id,
        })
      );
    }

    response = await modelWithTools.invoke(messages);
  }

  messages.push(response);
  return response;
}
