import "dotenv/config";

import { createInterface } from "node:readline/promises";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";

// -------------------------
// 1. Create our HR tools
// -------------------------

const getLeaveBalance = tool(
  async ({ employeeId }) => {
    console.log("\n🛠 get_leave_balance tool executed");

    // Hardcoded for now, matching the leave types in the policy
    // (docs/policies/leave-policy.pdf, section 3).
    // Later this will come from SQL (step 4).
    return JSON.stringify({
      employeeId,
      casualLeave: 4.5, // CL: 6/year, credited 1.5/quarter
      sickLeave: 6, // SL: 6/year, credited 1.5/quarter
      earnedLeave: 9, // EL: 12/year, credited 3/quarter
    });
  },
  {
    name: "get_leave_balance",

    description:
      "Get the current Casual Leave (CL), Sick Leave (SL) and Earned Leave (EL) balance of an employee.",

    schema: z.object({
      employeeId: z.string(),
    }),
  }
);

const calculateLeaveDays = tool(
  async ({ startDate, endDate }) => {
    console.log("\n🛠 calculate_leave_days tool executed");

    // Count the working days in [startDate, endDate], inclusive, skipping
    // Saturdays and Sundays. Public holidays aren't excluded yet - that
    // needs the holiday list from the database (step 4).
    const start = new Date(startDate);
    const end = new Date(endDate);

    let workingDays = 0;
    for (
      let day = new Date(start);
      day <= end;
      day.setDate(day.getDate() + 1)
    ) {
      const weekday = day.getDay(); // 0 = Sunday, 6 = Saturday
      if (weekday !== 0 && weekday !== 6) {
        workingDays++;
      }
    }

    return JSON.stringify({
      startDate,
      endDate,
      workingDays,
      note: "Weekends excluded. Public holidays not yet excluded.",
    });
  },
  {
    name: "calculate_leave_days",

    description:
      "Calculate how many working days (excluding weekends) fall between two dates. Use this whenever the user gives a date range and asks how many leave days it covers.",

    schema: z.object({
      startDate: z.string().describe("Start date, format YYYY-MM-DD"),
      endDate: z.string().describe("End date, format YYYY-MM-DD"),
    }),
  }
);

// Stand-in for RAG (step 5): a few policy snippets, keyword-matched.
const POLICY_SNIPPETS = [
  {
    keywords: ["casual", "cl"],
    text: "Casual Leave (CL): 6 days per calendar year, credited 1.5 days per quarter. CL cannot be carried forward or encashed; unused CL lapses at the end of the calendar year.",
  },
  {
    keywords: ["sick", "sl"],
    text: "Sick Leave (SL): 6 days per calendar year, credited 1.5 days per quarter. SL cannot be carried forward or encashed; unused SL lapses at the end of the calendar year.",
  },
  {
    keywords: ["earned", "el", "carry", "encash"],
    text: "Earned Leave (EL): 12 days per calendar year, credited 3 days per quarter. Up to 8 unused EL days carry forward to the next year, capped at 20 days total. Up to 8 EL days per year may be encashed through payroll, once per calendar year.",
  },
  {
    keywords: ["maternity"],
    text: "Maternity Leave: eligible employees get 26 weeks of paid leave for the first or second child, 12 weeks for the third or later. Up to 8 weeks may be taken before the expected delivery date.",
  },
  {
    keywords: ["paternity"],
    text: "Paternity Leave: 5 days per delivery or adoption, for the first and second child only, to be taken within 4 weeks of the event.",
  },
  {
    keywords: ["holiday", "weekend", "weekly off"],
    text: "If a public holiday or weekly off falls within an approved leave period, that day is not counted as leave.",
  },
];

const searchHRPolicy = tool(
  async ({ query }) => {
    console.log("\n🛠 search_hr_policy tool executed");

    const normalized = query.toLowerCase();
    const matches = POLICY_SNIPPETS.filter((snippet) =>
      snippet.keywords.some((keyword) => normalized.includes(keyword))
    );

    return JSON.stringify({
      query,
      results:
        matches.length > 0
          ? matches.map((m) => m.text)
          : ["No matching policy snippet found for this stub. Real document search (RAG) comes in a later step."],
    });
  },
  {
    name: "search_hr_policy",

    description:
      "Search HR leave policy text for rules about a topic (e.g. casual leave, sick leave, earned leave, maternity, paternity, holidays). This is a stubbed keyword search for now; it will be replaced with real document search (RAG) later.",

    schema: z.object({
      query: z.string(),
    }),
  }
);

// Name -> tool, so adding a new tool is a one-line change here and in
// bindTools below - no extra `if` branches needed.
const toolsByName = {
  get_leave_balance: getLeaveBalance,
  calculate_leave_days: calculateLeaveDays,
  search_hr_policy: searchHRPolicy,
};

// -------------------------
// 2. Create LLM
// -------------------------

const model = new ChatGoogleGenerativeAI({
  model: process.env.GEMINI_MODEL ?? "gemini-3.8-flash",
});

// -------------------------
// 3. Give tools to LLM
// -------------------------

const modelWithTools = model.bindTools(Object.values(toolsByName));

// -------------------------
// 4. System prompt
// -------------------------

const SYSTEM_PROMPT = `
You are an HR assistant.

The authenticated employee ID is EMP001.

Use the available tools whenever employee-specific
information, leave policy rules, or date calculations
are required. You may call more than one tool, one
after another, if the question needs it.
`;

// -------------------------
// 5. Agent loop for one user turn: ask -> run any requested
//    tools -> ask again, until the model stops calling tools.
//
//    `messages` is mutated in place (the caller's array grows
//    with this turn's user message, any tool calls/results, and
//    the final answer), so the same array can be reused across
//    turns to keep the whole conversation in context.
// -------------------------

async function runAgentTurn(messages) {
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

// -------------------------
// 6a. Single-shot mode: node index.js "question"
//     Asks one question and exits. Handy for quick, scripted
//     tests that don't burn through a whole chat session.
// -------------------------

async function runSingleShot(question) {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  console.log(`\nYou: ${question}`);

  const response = await runAgentTurn(messages);

  console.log("\nHR Agent:");
  console.log(response.text);
}

// -------------------------
// 6b. Interactive chat mode: node index.js (no argument)
//     Keeps one `messages` array for the whole session, so
//     later turns can refer back to earlier ones (context
//     handling) - e.g. "What about sick leave?" after already
//     asking about casual leave.
// -------------------------

async function runInteractiveChat() {
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

// -------------------------
// 7. Entry point
// -------------------------

// Pass a question on the command line for a quick single-shot test:
//   node index.js "What is my sick leave balance?"
// Run with no arguments for an interactive, context-aware chat.
const question = process.argv[2];

if (question) {
  await runSingleShot(question);
} else {
  await runInteractiveChat();
}
