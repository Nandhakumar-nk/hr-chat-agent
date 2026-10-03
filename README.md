# HR Chat Agent

An HR chat agent built with LangChain JS and Google Gemini, developed step by step.

## Step 1: one agent, one tool

`index.js` gives the LLM a single tool, `get_leave_balance`, and runs one tool-calling round:

```text
User question → LLM decides whether a tool is needed → app runs the tool
             → tool result goes back to the LLM → final answer
```

No `if (question.includes("leave"))` routing: the model chooses the tool from its name, description and schema.

## Step 2: multiple tools and an agent loop

`index.js` now has three tools: `get_leave_balance` (fixed to return CL/SL/EL, matching the real policy), `calculate_leave_days` (counts working days in a date range, weekends excluded), and `search_hr_policy` (a stubbed keyword search over a few policy snippets — real document search/RAG comes in a later step).

The fixed two-round shape from step 1 became a loop, since a question can need more than one tool, possibly one after another:

```text
User question → LLM decides which tool(s), if any, are needed
             → app runs each requested tool, feeds results back
             → LLM decides again: call more tools, or answer
             → ...repeats until no more tool calls → final answer
```

Tools are looked up from a `name → tool` map, so adding one is a one-line change instead of a new `if` branch.

Tested behavior:
- A compound question ("I want to take casual leave from Oct 12–16, do I have enough balance, and what's the CL policy?") makes the model call all three tools in the same turn, then correctly reason that 5 working days needed > 4.5 CL available, so the answer is "not enough".
- Plain tool and no-tool questions from step 1 still work.

**Note on free-tier rate limits:** the Google AI free tier allows only 20 requests/day per model. If you see a `429` quota error, either wait for the daily reset or point `GEMINI_MODEL` at a different model (for example `gemini-3.5-flash-lite`), which has its own separate quota.

## Setup

```bash
npm install
cp .env.example .env   # then put your Google AI API key in .env
```

## Run

```bash
node index.js                                                    # "How many leaves do I have?"
node index.js "Hi, who are you?"                                 # no tool needed
node index.js "What is my sick leave balance?"                   # one tool selected
node index.js "What is the earned leave carry forward and encashment rule?" # policy lookup
node index.js "How many working days are there from 2026-10-12 to 2026-10-16?" # date calculation
node index.js "I want to take casual leave from 2026-10-12 to 2026-10-16, do I have enough balance and what's the CL policy?" # all three tools, multi-tool reasoning
```

## Known limitations (next steps)

- Leave data is hardcoded; it will move to a database (step 4).
- `calculate_leave_days` excludes weekends but not public holidays yet; that needs the holiday list in the database (step 4).
- `search_hr_policy` is a stubbed keyword search over a few snippets, not real document search (RAG comes in step 5, see `CLAUDE.md` for the full roadmap).
- The LLM fills in `employeeId` from the system prompt. In the real design it must come from the authenticated session, never from the model.
- There's no conversation memory yet — each run is a single turn, so follow-up questions don't have context (step 3).
