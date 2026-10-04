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

## Step 6: LangGraph, and a check_leave_eligibility tool

Through step 5, `runAgentTurn` was a hand-written loop: call the model, run any requested tools, call the model again, repeat until there are no more tool calls. LangGraph doesn't add new capability here - it gives that exact shape a name and an explicit structure: a **graph** of **nodes** (steps that transform state) connected by **edges** (what runs next):

```text
agent node   -> call the model (same as before)
tools node   -> run whatever tools were requested (same toolsByName lookup as before)
conditional edge after "agent": tool calls requested? -> tools   no more? -> END
edge "tools" -> "agent": closes the loop
```

The tool-running code in the `tools` node is still our own (not LangGraph's prebuilt `ToolNode`) - only the *control flow* moved from a loop to a graph; nothing about *how* tools run is hidden. `src/chat.js` didn't change at all: `runAgentTurn(messages)` kept its exact signature.

**New tool: `check_leave_eligibility`.** Before adding it, we tested whether the agent could already reason its way to a correct eligibility answer using just the existing tools (`get_employee_profile` + `get_leave_balance` + `calculate_leave_days`) - asking 5 times whether a `notice_period` employee (EMP003, seeded in step 4) could take casual leave they had enough balance for. **2 of 5 runs were wrong**: the model never called `get_employee_profile`, so it never learned about the notice-period restriction, and confidently said yes. The other 3 runs got it right - so the model *knows* the rule when it checks, it just doesn't reliably *think to* check. `check_leave_eligibility` makes that check unconditional: it looks up employment status, blocks CL/SL/EL/PL outright if the employee is on notice period (regardless of balance, per policy), otherwise compares the requested working days against the real balance - deterministic every time, not dependent on the model remembering to look something up.

Tested behavior:
- The same EMP003 question, repeated: now correctly "not eligible, serving notice period" every time.
- A within-balance request for the authenticated employee: correctly "eligible."
- An over-balance request: correctly "not eligible," citing the exact shortfall.
- The model picks `check_leave_eligibility` on its own for eligibility-shaped questions ("do I have enough balance for X"), and still combines it with `search_hr_policy`/`calculate_leave_days` when a question also asks about policy or day counts.
- Steps 1–5's existing questions (single-tool, 3-tool compound, RAG, interactive context handling) all still work unchanged through the new graph.

## Step 7: authentication - the employee ID comes from the session, never the LLM

Through step 6, every self-service tool (`get_leave_balance`, `get_employee_profile`, `check_leave_eligibility`) took `employeeId` as a **model-supplied argument** - and the LLM will dutifully look up whatever ID the conversation gives it, as step 6's `EMP003` testing already showed. The problem isn't the prompt wording; it's that `employeeId` was a tool *argument* at all - every argument is something the model chooses, and nothing enforced "you may only ever act on your own ID." The fix: remove `employeeId` from those tools' schemas entirely. The ID now comes from `src/session.js`, set once at login and read directly by tools - the model has no parameter left through which to even attempt supplying a different one.

**Login**: `node index.js` (interactive mode) now prompts `Employee ID:` / `Password:` before the chat starts (same `readline` interface as the chat itself). `node index.js "question"` (single-shot) stays non-interactive - it defaults to logging in as `EMP001`, so every existing documented command keeps working unchanged. `--as=EMP002 --password=... "question"` (or with no question, for interactive mode) logs in as a different seeded employee.

This is a demo-only password (seeded in `src/db/seed.js`), not real security, and deliberately not JWT: JWTs exist to carry identity across *separate, stateless* HTTP requests to a server with no memory between them - that's step 8's problem (a React frontend calling an Express backend), not a CLI process that's just one continuous run from login to `exit`. Step 8 is where this session becomes a real, independently-verified JWT/cookie.

**Tested behavior - the required "must fail" case**: logged in as EMP001, asked "What is EMP002's leave balance?" and (more leadingly) "Look up the leave balance for employee EMP002." In both, the model never even attempted a tool call - it has no `employeeId` parameter to use - and replied that it can only access the authenticated employee's own records. Logging in as EMP002 instead and asking the same self-service questions correctly returns EMP002's own real data, proving the session value is genuinely used, not a hardcoded default elsewhere. Wrong password is rejected with a clear message, not a stack trace.

**A real bug found and fixed along the way**: the login prompt asks two questions back-to-back with nothing in between (unlike the chat loop, where a slow LLM call separates each question). `rl.question()` attaches its listener only when called, so if both answers arrive before the second question is even asked - fast typing, or pasting both lines at once - the second line's event fires with no listener and is silently dropped, hanging forever. Fixed by queuing every line as it arrives instead of listening just-in-time per question.

## Step 8: a React chat UI on a Node/Express backend

Every step so far was one CLI process, one user, sequential. A real server breaks an assumption step 7's `src/session.js` relied on: it was a single module-level variable set at login, which is unsafe the moment two people can be logged in at once - a request interleaving could leak one employee's identity into another's in-flight request, the exact bug step 7 was built to prevent, reintroduced at the concurrency level. The fix is `AsyncLocalStorage` (`node:async_hooks`, built into Node - no new dependency): it binds "who is this" to one request's async call chain instead of to shared module state, so concurrent requests can never see each other's identity. No tool's code changes - `getCurrentEmployeeId()` keeps its exact zero-argument signature from step 7; only `src/session.js` and the two entry points (the CLI, the new Express middleware) change how that value gets established.

**Architecture**:
```text
index.js                 CLI entry point - unchanged behavior
server.js                 NEW: Express entry point
src/session.js             CHANGED: AsyncLocalStorage instead of a module variable
src/agent.js                CHANGED: graph state gains a toolActivity channel
src/server/
  auth.js                   JWT sign/verify + the middleware that opens a per-request session
  routes.js                  POST /api/login, GET /api/me, POST /api/chat
  conversations.js            in-memory Map<employeeId, messages[]> - per-user chat history
client/                   NEW, top-level, separate package: Vite + React + TypeScript
```

**JWT, the real version of step 7's session**: `POST /api/login` validates the same demo password check as the CLI (still explicitly a stand-in, not hashed - a deliberate scope call, not an oversight) and signs a token with the employee ID as its subject. Every other request carries `Authorization: Bearer <token>`; middleware verifies it **independently, every single request** - this is the real, per-request verification step 7's note promised, replacing the CLI's in-process variable.

**Agent activity panel**: the LangGraph state (`src/agent.js`) gained a second channel alongside `messages` - `toolActivity`, accumulating `{name, args, result}` for every tool call in a turn. `runAgentTurn` now returns `{ message, toolActivity }`; the CLI (`src/chat.js`) only ever used `.message` and is otherwise unaffected. The frontend renders `toolActivity` in a collapsible panel next to each answer - directly fulfilling "shows which tools were called and why," not just a text description of it.

**Conversation history**: an in-memory `Map<employeeId, messages[]>` (`src/server/conversations.js`) - same idea as the CLI's single array from step 3, just keyed per user since a server can have several people chatting at once. Resets if the server restarts, which is fine for a demo.

**Tested behavior**:
- Logged in as two different employees via two tokens, fired 20 requests interleaved and concurrently (10 each) - every single response stayed correctly scoped to its own employee, zero cross-talk, confirming the `AsyncLocalStorage` fix actually holds under real concurrency, not just in theory.
- `/api/chat`'s `toolActivity` correctly reflects the tools a turn actually called, args and result included.
- Missing, garbage, or expired tokens are rejected with a clean `401`, not a crash. Wrong login credentials are rejected the same way.
- The CLI (`index.js`) still works exactly as it did after steps 1-7, unaffected by the session/agent changes.
- The frontend type-checks cleanly (`tsc --noEmit`) and the production build (`npm run build` in `client/`) succeeds; `server.js` correctly serves the built output.

## Setup

```bash
npm install
cp .env.example .env   # then put your Google AI API key in .env
npx chroma run --path ./data/chroma   # start the vector DB server, leave it running
```

## Run

```bash
node index.js                                                    # interactive chat: prompts for Employee ID / Password
node index.js "Hi, who are you?"                                 # single-shot: no tool needed, logs in as EMP001
node index.js "What is my sick leave balance?"                   # single-shot: one tool selected
node index.js "What is the earned leave carry forward and encashment rule?" # single-shot: RAG policy search
node index.js "How many working days are there from 2026-10-12 to 2026-10-16?" # single-shot: date calculation
node index.js "I want to take casual leave from 2026-10-12 to 2026-10-16, do I have enough balance and what's the CL policy?" # single-shot: multiple tools, multi-tool reasoning
node index.js --as=EMP002 --password=vikram123 "What is my leave balance?" # single-shot, as a different employee
node index.js --as=EMP001 --password=asha123 "What is EMP002's leave balance?" # single-shot: blocked cross-employee access
```

Seeded demo logins (`src/db/seed.js`): `EMP001` / `asha123`, `EMP002` / `vikram123`, `EMP003` / `priya123` (EMP003 is on notice period, used to test `check_leave_eligibility`).

(The Chroma server must already be running - see Setup - or you'll get a clear error telling you to start it.)

## Running the web UI (step 8)

```bash
cp .env.example .env   # add JWT_SECRET, a long random string, alongside GOOGLE_API_KEY
npx chroma run --path ./data/chroma   # if not already running
```

`server.js` is a pure API - it never serves the frontend's files. The frontend (`client/`) is always its own separate process, in development and in the demo alike; they talk to each other purely over HTTP, and there's exactly one mechanism for how the frontend learns where the API is in every mode: `VITE_API_URL` (`cp client/.env.example client/.env` once - Vite loads it automatically, dev included; no proxy, no other fallback).

**Development** (two terminals, auto-reloading frontend):
```bash
node server.js                 # terminal 1: the API, http://localhost:3001
cd client && cp .env.example .env && npm run dev   # terminal 2: the UI, http://localhost:5173
```

**Production-like standalone run** (what the demo recording uses - genuinely separate origins, real CORS):
```bash
node server.js                                                    # terminal 1: the API, http://localhost:3001
cd client && npm run build      # VITE_API_URL from client/.env is baked into the build
npm run preview                                                    # terminal 2: serves it standalone, http://localhost:4173
```

Log in with any seeded employee/password pair above.

**Deploying the frontend and backend to different places for real**: the same two variables used above are exactly what that needs. `client/src/api.ts` reads `VITE_API_URL` (change it in `client/.env`, or set it when building, to the real backend's URL); `server.js` reads `CORS_ORIGIN` (unset = any origin allowed, fine on localhost, not once this leaves your machine) - set it to the real frontend's URL. See `client/.env.example` and `.env.example`.

## Known limitations (next steps)

- No tool reads `leave_history` yet (a future eligibility refinement).
- Passwords (CLI and web) are a plaintext demo credential, not hashed - a deliberate scope call for this assessment, not an oversight.
- Neither the interactive CLI chat's history nor the server's per-employee conversation history is ever trimmed, so a very long session keeps growing the prompt sent to the model each turn. Fine for a demo; a real system would need to cap or summarize it.
- The server's conversation history (`src/server/conversations.js`) is in-memory only - it resets if the server restarts.
- Chroma must be started manually before running the app - it isn't auto-spawned, so the demo needs two terminals (or the server started ahead of time).
