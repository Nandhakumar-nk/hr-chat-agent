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

## Step 3: context handling

An LLM call has no memory of its own — the only thing it "knows" is whatever is in the `messages` array sent with that call. Steps 1–2 rebuilt that array from scratch for a single question each run, so there was nothing to follow up on.

`index.js` now has two modes:
- **`node index.js "question"`** — unchanged single-shot mode from steps 1–2, still handy for quick, scripted tests.
- **`node index.js`** (no argument) — an interactive chat. It keeps one `messages` array for the whole session: each turn's question and answer (and any tool calls in between) stay in that array, so later turns can refer back to earlier ones. Type `exit` or `quit` to end the session.

The tool-calling loop from step 2 (ask → run tools → ask again until no more tool calls) is unchanged; it's now wrapped in a `runAgentTurn(messages)` function that both modes call, once per turn.

Tested behavior (interactive mode):
```text
You: What is my casual leave balance?
HR Agent: Your current casual leave balance is 4.5 days.

You: What about sick leave?
HR Agent: Your current sick leave balance is 6 days.
```
"What about sick leave?" is ambiguous on its own - about the balance? the policy? something else? Because the earlier turn is still in `messages`, the model resolves it as a follow-up to the balance question, without the user having to repeat "what is my ... balance".

## Setup

```bash
npm install
cp .env.example .env   # then put your Google AI API key in .env
```

## Run

```bash
node index.js                                                    # interactive chat, with context across turns
node index.js "Hi, who are you?"                                 # single-shot: no tool needed
node index.js "What is my sick leave balance?"                   # single-shot: one tool selected
node index.js "What is the earned leave carry forward and encashment rule?" # single-shot: policy lookup
node index.js "How many working days are there from 2026-10-12 to 2026-10-16?" # single-shot: date calculation
node index.js "I want to take casual leave from 2026-10-12 to 2026-10-16, do I have enough balance and what's the CL policy?" # single-shot: all three tools, multi-tool reasoning
```

## Known limitations (next steps)

- Leave data is hardcoded; it will move to a database (step 4).
- `calculate_leave_days` excludes weekends but not public holidays yet; that needs the holiday list in the database (step 4).
- `search_hr_policy` is a stubbed keyword search over a few snippets, not real document search (RAG comes in step 5, see `CLAUDE.md` for the full roadmap).
- The LLM fills in `employeeId` from the system prompt. In the real design it must come from the authenticated session, never from the model.
- The interactive chat's message history is never trimmed, so a very long session would keep growing the prompt sent to the model each turn. Fine for a demo; a real system would need to cap or summarize it.
- There's no conversation memory yet — each run is a single turn, so follow-up questions don't have context (step 3).
