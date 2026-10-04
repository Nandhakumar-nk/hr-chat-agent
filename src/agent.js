// Orchestration layer: creates the LLM, binds the tools to it, and runs
// one agent turn as a LangGraph graph instead of a hand-written loop.
//
// The graph is exactly the same two steps the old while-loop did:
//   "agent" node -> call the model
//   "tools" node -> run whatever tools were requested
// with a conditional edge after "agent" ("more tools? go to tools; else
// stop") and an edge "tools" -> "agent" to close the loop. LangGraph
// gives this shape structure (nodes + edges); it doesn't change *how*
// tools run - that's still our own toolsByName lookup, not LangGraph's
// prebuilt ToolNode, so nothing about tool execution is hidden.
//
// src/chat.js calls runAgentTurn once per user turn and never talks to
// the model, the graph, or the tools directly.

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ToolMessage } from "@langchain/core/messages";
import { StateGraph, MessagesAnnotation, START, END } from "@langchain/langgraph";

import { toolsByName } from "./tools/index.js";

const model = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});

const modelWithTools = model.bindTools(Object.values(toolsByName));

export const SYSTEM_PROMPT = `
You are an HR assistant.

You are talking to one authenticated employee. The
self-service tools (get_leave_balance, get_employee_profile,
check_leave_eligibility) always act on that employee - they
take no employee ID parameter, because you have no way to
access another employee's data.

If the user asks about a different employee ID than their
own, explain plainly that you can only access their own
records - do not answer as if the question were about them,
and do not guess at another employee's information.

Use the available tools whenever employee-specific
information, leave policy rules, or date calculations
are required. You may call more than one tool, one
after another, if the question needs it.
`;

// "agent" node: ask the model. Identical to the old loop's
// modelWithTools.invoke(messages) call.
async function callModel(state) {
  console.log("call model, state.messages:", state.messages)
  const response = await modelWithTools.invoke(state.messages);

  console.log("\nLLM decision:");
  console.log(response.tool_calls);

  return { messages: [response] };
}

// "tools" node: run every tool the model just requested. Identical to
// the old loop's for-loop over response.tool_calls.
async function callTools(state) {
  const lastMessage = state.messages.at(-1);

  const toolMessages = [];
  for (const toolCall of lastMessage.tool_calls) {
    const toolToRun = toolsByName[toolCall.name];
    const result = await toolToRun.invoke(toolCall.args);

    console.log("\nTool result:");
    console.log(result);

    toolMessages.push(
      new ToolMessage({
        content: result,
        tool_call_id: toolCall.id,
      })
    );
  }

  return { messages: toolMessages };
}

// Conditional edge after "agent": more tool calls requested -> "tools",
// otherwise the final answer is ready -> END.
function shouldContinue(state) {
  const lastMessage = state.messages.at(-1);
  return lastMessage.tool_calls?.length ? "tools" : END;
}

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", callTools)
  .addEdge(START, "agent")
  .addConditionalEdges("agent", shouldContinue, { tools: "tools", [END]: END })
  .addEdge("tools", "agent")
  .compile();

// `messages` is mutated in place (the caller's array grows with this
// turn's user message, any tool calls/results, and the final answer), so
// the same array can be reused across turns to keep the whole
// conversation in context (step 3's context handling).
export async function runAgentTurn(messages) {
  console.log("messages context:", messages);
  const result = await graph.invoke({ messages });

  // The graph starts its internal state from `messages` and appends
  // every node's output to it (MessagesAnnotation's reducer), so
  // result.messages is the complete, updated history. Write it back into
  // the caller's array in place, so it keeps the same identity chat.js
  // is holding onto across turns.
  messages.length = 0;
  messages.push(...result.messages);

  return messages.at(-1);
}
