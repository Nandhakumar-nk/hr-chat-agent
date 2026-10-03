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

## Step 4: a real database, and code organized into layers

Through step 3, every tool returned hardcoded data, and all the code lived in one `index.js`. That was fine for three small functions, but a database brings its own concerns (schema, seeding, queries) that don't belong mixed into the model/CLI code. So this step does two things together: adds SQLite, and splits the code into layers, each only talking to the one below it:

```text
index.js            entry point: single-shot vs interactive, nothing else
src/chat.js          presentation: the two CLI modes (readline)
src/agent.js         orchestration: the model, bindTools, the runAgentTurn loop
src/tools/index.js   business logic: the 5 tool definitions
src/db/              data access: schema, seed data, connection, queries
```

The database uses `node:sqlite`, built into Node.js - no new dependency, same reasoning as step 3's `readline`. `src/db/connection.js` creates `data/hr.sqlite` on first run, applies `schema.sql`, and seeds it from `src/db/seed.js` (only if empty, so re-running never duplicates data). `data/` is gitignored - the database is cheap to rebuild from code, so a fresh clone just works with `npm install`.

What changed:
- `get_leave_balance` now queries the `leave_balances` table instead of returning hardcoded JSON.
- `calculate_leave_days` now excludes public holidays (from the `holidays` table) as well as weekends.
- Two new tools: `get_employee_profile` and `get_holidays`.
- Seeded data: 3 fictitious employees (richer data for later steps - no new tool uses EMP002/EMP003 yet), their leave balances, a few sample `leave_history` rows (not read by any tool yet, but seeded now to avoid a schema change later), and all 12 holidays from `docs/policies/holiday-list-2026.pdf`.

Tested behavior:
- `calculate_leave_days` on a range that includes Ayudha Poojai (Monday 19-Oct-2026, a weekday holiday) now correctly returns 5 working days for Oct 12–19, not 6 - proof the holiday list is actually being excluded, not just weekends.
- `get_employee_profile` and `get_holidays` both work as expected; `get_leave_balance` gives the same numbers as before, now from the database.
- Interactive mode (step 3's context handling) still works unchanged after the restructure.

## Step 5: RAG over the real HR policy PDF

Through step 4, `search_hr_policy` was a stub: ~6 hardcoded snippets, keyword-matched. RAG (Retrieval-Augmented Generation) replaces that with real search over `docs/policies/leave-policy.pdf`:

```text
PDF → one Document per page
    → RecursiveCharacterTextSplitter (chunks, page number kept)
    → GoogleGenerativeAIEmbeddings (text → vector)
    → Chroma (stores vectors, finds the closest ones to a query)
```

At indexing time, each chunk is embedded and stored. At query time, the *question* is embedded the same way, and the stored chunks whose vectors are closest ("most similar in meaning") are retrieved and handed to the model - so the model answers from real retrieved text, not a guess, and cites the page it came from.

This is the first step with an external process dependency: **Chroma runs as a separate local server**, not embedded in the Node process. Start it once before running the app:

```bash
npx chroma run --path ./data/chroma   # start once, leave running
node index.js "..."                    # in another terminal, as before
```

`src/rag/` does the indexing (`ensureIndexed()`, automatic on first run, same "fresh clone just works" idea as step 4's database) and retrieval (`retrieve(query, k)`), written directly against `pdf-parse` and the `chromadb` client rather than `@langchain/community`'s `PDFLoader`/`Chroma` wrappers - that package was deprecated/sunset by the LangChain team while building this step, with no replacement package yet, so this avoids depending on something already announced as unmaintained. `@langchain/textsplitters` and `@langchain/google-genai`'s embeddings are still used directly, unaffected by that deprecation.

Citations are by **page number** (1–8), not a named section - the natural unit the pipeline works with, more robust than hand-parsing heading text out of extracted PDF output.

Tested behavior: asked one question per policy area and checked the retrieved page and the final answer against the real PDF text:
- "Can I carry forward my casual leave?" → page 6 (the FAQ), correctly: no.
- "How does PL to EL conversion work with 11 days?" → page 3, correctly reproduces the policy's own worked example (7 retained, 4 converted → 2 EL).
- "What is the maternity leave policy for adoption?" → page 5, accurate summary.
- Stopping the Chroma server produces a clear "start it first: `npx chroma run ...`" message, not a raw stack trace.
- Interactive mode (step 3) still works: a DB-backed question, then a RAG follow-up ("Can *that* be carried forward?") that depends on the earlier turn's context.

## Setup

```bash
npm install
cp .env.example .env   # then put your Google AI API key in .env
npx chroma run --path ./data/chroma   # start the vector DB server, leave it running
```

## Run

```bash
node index.js                                                    # interactive chat, with context across turns
node index.js "Hi, who are you?"                                 # single-shot: no tool needed
node index.js "What is my sick leave balance?"                   # single-shot: one tool selected
node index.js "What is the earned leave carry forward and encashment rule?" # single-shot: RAG policy search
node index.js "How many working days are there from 2026-10-12 to 2026-10-16?" # single-shot: date calculation
node index.js "I want to take casual leave from 2026-10-12 to 2026-10-16, do I have enough balance and what's the CL policy?" # single-shot: multiple tools, multi-tool reasoning
```

(The Chroma server must already be running - see Setup - or you'll get a clear error telling you to start it.)

## Known limitations (next steps)

- No tool reads `leave_history` or distinguishes `active` vs `notice_period` status yet (eligibility logic comes in step 6).
- The LLM fills in `employeeId` from the system prompt. In the real design it must come from the authenticated session, never from the model (step 7).
- The interactive chat's message history is never trimmed, so a very long session would keep growing the prompt sent to the model each turn. Fine for a demo; a real system would need to cap or summarize it.
- Chroma must be started manually before running the app - it isn't auto-spawned, so the demo needs two terminals (or the server started ahead of time).
