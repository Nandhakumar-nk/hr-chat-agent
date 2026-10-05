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
import { StateGraph, MessagesAnnotation, Annotation, START, END } from "@langchain/langgraph";

import { toolsByName } from "./tools/index.js";

const model = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});

const modelWithTools = model.bindTools(Object.values(toolsByName));

export const SYSTEM_PROMPT = `
You are an HR assistant.

You are talking to one authenticated employee. The
self-service tools (get_leave_balance, get_employee_profile,
check_leave_eligibility, check_wfh_eligibility,
check_loan_eligibility) always act on that employee - they
take no employee ID parameter, because you have no way to
access another employee's data.

If the user asks about a different employee ID than their
own, explain plainly that you can only access their own
records - do not answer as if the question were about them,
and do not guess at another employee's information.

The "eligible" verdict and "reason" returned by
check_leave_eligibility, check_wfh_eligibility and
check_loan_eligibility are authoritative - report them as-is.
Do not add, override, or contradict them with a rule you
inferred yourself, even a plausible-sounding one. If
search_hr_policy doesn't return a passage supporting some
claim, say the policy doesn't specify it rather than guessing
what a company might typically do.

Use the available tools whenever employee-specific
information, HR policy rules (leave, benefits, staff loan,
work-from-home), or date calculations are required. You may
call more than one tool, one after another, if the question
needs it.
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
// the old loop's for-loop over response.tool_calls, plus recording each
// call into toolActivity - the data the "agent activity" panel (step 8)
// renders, so the UI can show which tools ran and why without parsing
// console output.
async function callTools(state) {
  const lastMessage = state.messages.at(-1);

  const toolMessages = [];
  const activity = [];
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
    activity.push({ name: toolCall.name, args: toolCall.args, result });
  }

  return { messages: toolMessages, toolActivity: activity };
}

// Conditional edge after "agent": more tool calls requested -> "tools",
// otherwise the final answer is ready -> END.
function shouldContinue(state) {
  const lastMessage = state.messages.at(-1);
  return lastMessage.tool_calls?.length ? "tools" : END;
}

// Graph state: the standard `messages` channel, plus `toolActivity` - a
// second channel, reset to [] on each `graph.invoke()` call (it isn't
// part of the `messages` input, so it starts from its own default every
// turn), accumulating via concat as callTools runs. This is what the
// step 8 agent-activity panel reads; callModel never touches it.
const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  toolActivity: Annotation({
    reducer: (existing, update) => existing.concat(update),
    default: () => [],
  }),
});

const graph = new StateGraph(AgentState)
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
//
// Returns { message, toolActivity }: `message` is the final answer
// (same as this function used to return directly - src/chat.js reads
// `.message.text`); `toolActivity` is this turn's tool calls, for
// callers that want to show them (the step 8 API/UI) - the CLI ignores it.
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

  return { message: messages.at(-1), toolActivity: result.toolActivity };
}
