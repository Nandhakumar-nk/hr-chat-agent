# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An HR chat agent built step by step with LangChain JS and Google Gemini, as a learning project for an Agentic AI assessment. The README documents each step. Update it whenever a step is added.

## How we work: learning project

This is the developer's first agent-building project, and they are learning as they build. They already know React, Node.js, databases and APIs, and they know Claude's agent and tool concepts. What's new to them is how an LLM chooses and calls tools, agent loops, and RAG.

- Build in small steps. Each step adds one new concept, runs end to end, and gets its own commit and README section.
- Before coding a step, explain the concept and why it's needed. After it runs, show the observed behavior, such as the `tool_calls` the model chose, and point out what is still missing.
- Keep code readable and heavily commented. Prefer plain LangChain JS over abstractions that hide the tool-calling loop. LangGraph is used (step 6) for the agent's control flow (nodes/edges), but tool execution is still our own code, not LangGraph's prebuilt `ToolNode` - don't swap that in for convenience.
- Before adding a tool that duplicates what the model could already do by combining existing tools, test whether orchestration-only is actually reliable first (see step 6's `check_leave_eligibility`, added only after finding the model got the notice-period rule wrong in 2 of 5 identical runs). A new tool should fix a demonstrated reliability gap, not just look more complete.
- Don't jump ahead. Finish the current step, then propose the next one from the roadmap and let the developer choose.

Roadmap toward the assessment (deadline Tue Oct 6, 1 PM; deliverables are a public GitHub repo, a demo video and architecture docs). It is judged on implementation, agentic approach, framework usage, tool integration, architecture and completeness:
1. One agent, one tool (`get_leave_balance`). Done.
2. Several tools (`calculate_leave_days` for working days in a date range, `search_hr_policy` with stubbed text for now), with the model choosing between them and a loop that runs until there are no more tool calls. Done.
3. Context handling: keep the message history across turns in an interactive CLI chat, so follow-ups like "what about 7 days?" work. Done.
4. A SQL database (SQLite) for employees, leave balances, leave history and holidays. Add tools such as `get_employee_profile` and `get_holidays`. Done.
5. RAG over `docs/policies/leave-policy.pdf`: chunk, embed, retrieve, and cite the source page in answers. Done.
6. Move to LangGraph JS. Rebuild the hand-written loop as a graph, now that the loop is understood, and add a `check_leave_eligibility` tool that combines balance, policy rules and date calculation. Done.
7. Authentication: the employee ID comes from the session and never from the LLM. Requesting another employee's data must fail, and the demo shows this. Done (CLI-appropriate version: a `src/session.js` set by login, not a real token - see Architecture).
8. A React chat UI on a Node/Express backend, with an "agent activity" panel that shows which tools were called and why. Done - `src/session.js`'s identity now uses `AsyncLocalStorage`, JWT verified per-request, `src/agent.js`'s graph state carries `toolActivity`. See Architecture.
9. Docs and demo: a README with an architecture diagram, framework choices, tools and implementation approach. Record the demo video of the key flows: policy question (RAG), balance (DB), date calculation, eligibility (multi-tool), follow-up (context) and authorization failure. Docs half done (README's new Architecture section); demo video still to record.
10. Guardrails and safety validation: layered guardrails around the existing architecture - tool input validation (a shared `validateDateRange` helper, deterministic, in `src/tools/index.js`), prompt-injection/jailbreak resistance and RAG grounding (a new `SYSTEM_PROMPT` rule block in `src/agent.js`), and documenting the output validation that already exists structurally (`submit_leave_request` re-verifies eligibility server-side before writing, regardless of what the model's text claims). Each guardrail has a positive and a negative test, run via `node index.js` before and after the change, with the actual pass/fail count reported rather than asserted. Done.

The assessment (steps 1-10) is complete. Steps 11+ below are further "standard agentic layers," picked up afterward as a learning exercise, not assessment requirements - same incremental discipline applies.

11. Observability/tracing: a new `agent_traces` table (`src/db/schema.sql`) and `recordTrace` (`src/db/repository.js`) give every turn a durable, queryable row - employee, user message, final answer, the tool_calls JSON, total tokens (summed across every `AIMessage` the turn produced, since a turn can loop through multiple model calls), and latency. Called once per turn from `runAgentTurn` (`src/agent.js`). No new dependency, no separate tracing service - plain SQLite, the same pattern as every other write in this project. Done.

After step 9 docs were started, 3 more real policy PDFs were added (Employee Benefits, Staff Loan, Work from Home) and brought in: RAG now spans all 4 policy documents (`src/rag/index.js`), and `check_wfh_eligibility` / `check_loan_eligibility` were added as 2 more deterministic tools (9 total with `submit_leave_request` below), following the same pattern as `check_leave_eligibility`. See "Source documents" above for what backs each. Later, `submit_leave_request` was added - the agent's first data-mutating tool, confirm-gated (a required `confirmed: boolean` argument, never settable by the model until the employee has explicitly confirmed), auto-approved immediately with an immediate `leave_balances` deduction in the same transaction as the `leave_history` insert (`recordApprovedLeave` in `src/db/repository.js`) - there's no separate approval workflow anywhere else in this app to defer to.

## Source documents (`docs/policies/`)

These are the documents shared with the assessment. They are the source of truth for tool logic, seed data and RAG. The repo is public, so these are redacted copies of the internal PDFs: people's names and contact details are removed, the company is called "the Company", and its internal leave tool is called "the HR portal". All other text is unchanged. The originals are gitignored, so never commit them.

- `leave-policy.pdf`: Leave Policy v1.3 (02-Mar-26). An older v1.2 also exists (20 days a year, no Sick Leave). It is superseded, so don't use it.
- `holiday-list-2026.pdf`: 12 public holidays. Saturdays and Sundays are weekly offs.
- `Employee Benefits Policy - Newly Wed_Newborn.pdf`: wedding and newborn gift vouchers. RAG-only, no deterministic tool - the amounts are flat and the only eligibility rule (notice period excluded) is already covered by the existing employee-status check elsewhere.
- `Staff Loan Policy - 2025.pdf`: staff loan eligibility and terms. Backs `check_loan_eligibility`.
- `Work from Home - Hybrid Policy.pdf`: WFH/hybrid eligibility and day quota. Backs `check_wfh_eligibility`.

Policy rules the tools must implement, not just retrieve:
- Leave types: Casual (CL) 6, Sick (SL) 6 and Earned (EL) 12 days per calendar year, credited quarterly (1.5 + 1.5 + 3). CL and SL lapse at year end. Up to 8 EL days carry forward, and the EL balance is capped at 20. Older employees may also hold legacy Privilege Leave (PL), which doesn't expire.
- Leave day counts skip weekends and the listed holidays (policy section 7.3). `calculate_leave_days` must use the holiday list.
- Employees serving notice can't take CL, SL, EL, PL or WFH, and can't encash EL. Eligibility depends on employee status, so the employees table needs it.
- Calculations stated in the policy: PL-to-EL conversion (keep 6 days if the balance is even or 7 if odd, then convert the rest at 2 PL : 1 EL) and EL encashment (up to 8 days a year, once a year). These are good candidates for deterministic tools.
- Maternity and paternity leave are separate from the annual balances. Answer questions about them from the policy text.
- Staff loan eligibility (`check_loan_eligibility`): confirmed employment with >= 1 year tenure, CTC <= INR 20 lakhs (`employees.ctc`), no currently active loan, >= 6 months since the last loan's `closed_date`, and at most 1 loan per financial year (Apr-Mar). Max loan INR 2 lakhs over up to 12 EMIs when eligible. Needs the `employees.ctc` column and the `loans` table.
- WFH/hybrid eligibility (`check_wfh_eligibility`): tenure-gated (< 1 year: no; 1-2 years: no by default, exception possible for exceptional performance; >= 2 years: yes) from `employees.date_of_joining`. Role/training/project-criticality exclusions in the policy aren't tracked by this system - the tool says so rather than guessing. Day quota (2/week, 8/month, no carry-forward, overage -> CL/PL/LOP) is returned as policy text, not computed - there's no WFH-usage tracking table.

## Commands

```bash
npm install
cp .env.example .env              # set GOOGLE_API_KEY, JWT_SECRET (and optionally GEMINI_MODEL)
npx chroma run --path ./data/chroma  # start the vector DB server first, leave it running
node index.js                     # interactive chat: prompts for Employee ID / Password, context kept across turns
node index.js "<question>"        # single-shot: ask one question and exit, logs in as EMP001 by default
node index.js --as=EMP002 --password=vikram123 "<question>"  # single-shot or interactive, as a different seeded employee
node server.js                    # the Express API (step 8), http://localhost:3001
cd client && npm run dev          # the React UI dev server, http://localhost:5173 - proxies /api to 3001
```

Seeded demo logins (`src/db/seed.js`): `EMP001`/`asha123`, `EMP002`/`vikram123`, `EMP003`/`priya123` (notice period). If `src/db/schema.sql` changes, delete `data/hr.sqlite` and let `connection.js` reseed it - there's no migration system, and the file is gitignored/disposable.

There are no tests, linter or build step. To verify a change, run `index.js` with questions that should and shouldn't trigger a tool, in both modes. The README lists sample questions. The Google AI free tier caps a model at 20 requests/day; if you hit a `429`, rerun with `GEMINI_MODEL=gemini-3.5-flash-lite` (a separate quota) rather than waiting out the reset. If `search_hr_policy` errors with a connection message, the Chroma server isn't running - start it as shown above.

## Architecture

The code is layered, each layer only talking to the one below it:

```text
index.js             CLI entry point: arg parsing, login, single-shot vs interactive
server.js             Express entry point (step 8): serves the API, and client/dist if it exists
src/chat.js           presentation: the two CLI modes (node:readline), plus the login prompt
src/agent.js          orchestration: the model, bindTools, the runAgentTurn graph (LangGraph)
src/tools/index.js    business logic: the tool definitions
src/session.js         the current request/process's employee ID (AsyncLocalStorage) - tools read it, nothing else sets it
src/server/            HTTP-only: auth.js (JWT + session middleware), routes.js, conversations.js
src/db/               data access: schema.sql, seed.js, connection.js, repository.js
src/rag/              RAG: pdfLoader.js, embeddings.js, chromaStore.js, index.js (ensureIndexed/retrieve)
client/               separate package (step 8): Vite + React + TypeScript chat UI
```

- Tools never touch the database or Chroma directly - they call functions in `src/db/repository.js` or `src/rag/index.js`. `src/db/connection.js` opens/creates `data/hr.sqlite` (gitignored) and seeds it from `src/db/seed.js` only when `employees` is empty, so re-running never duplicates data.
- `runAgentTurn(messages)` in `src/agent.js` wraps a LangGraph `StateGraph`: an `agent` node (call the model) and a `tools` node (run any requested tools, via the same `toolsByName` map in `src/tools/index.js` as always - a new tool is still a one-line addition there, no `if` chain), with a conditional edge back to `agent` until there are no more tool calls. The graph's own internal loop replaces what used to be a hand-written `while` loop - same behavior, now explicit nodes/edges instead of hidden control flow. `runAgentTurn` mutates the caller's `messages` array in place after the graph returns, which is what lets `src/chat.js`'s interactive mode keep conversation context across turns (step 3) by reusing the same array.
- The model never gets keyword routing. It picks tools from their name, description and schema, so write those carefully.
- The model is chosen with `GEMINI_MODEL`, defaulting to `gemini-3.8-flash`. `GOOGLE_API_KEY` is read from `.env` by `dotenv`, and `.env` is gitignored.
- `src/tools/index.js` is one file because there are only 9 small tools. Split it (e.g. one file per tool) once it actually gets unwieldy - don't do that split pre-emptively.
- Uses `node:sqlite` and `node:readline`, both built into Node.js - avoid adding a dependency for something the runtime already provides.
- `src/rag/` is written directly against `pdf-parse` and the `chromadb` client, not `@langchain/community`'s `PDFLoader`/`Chroma` wrappers - that package was deprecated/sunset by the LangChain team (no replacement exists yet), so don't add it back for convenience later. `@langchain/textsplitters` and `@langchain/google-genai`'s embeddings are unaffected and still used directly.
- Chroma (`src/rag/chromaStore.js`) is the one external process this project depends on - a real local vector-DB server (`npx chroma run --path ./data/chroma`), not embedded in the Node process. `ensureIndexed()` (called once from `index.js`) gives a clear error if it isn't running, rather than a raw stack trace.
- `employeeId` is never a tool argument (step 7). `get_leave_balance`, `get_employee_profile`, `check_leave_eligibility`, `check_wfh_eligibility` and `check_loan_eligibility` all take zero arguments and call `getCurrentEmployeeId()` from `src/session.js` internally - the model has no parameter through which to ask for another employee's data, so there's no prompt-level trust to get wrong.
- `src/session.js` uses `AsyncLocalStorage` (`node:async_hooks`, built in), not a plain module variable - a server can have several people's requests in flight at once, and a shared variable would let one request's identity leak into another's mid-flight. `withSession(employee, fn)` binds `employee` for the duration of `fn`'s whole async chain: the CLI (`index.js`) calls it once per run; the Express middleware (`src/server/auth.js`) calls it once per request, after verifying the JWT - so concurrent requests are isolated regardless of timing. Tested directly: 20 concurrent interleaved requests across two different logged-in employees, zero cross-talk. `authenticate(employeeId, password)` (the password check itself) is still a demo stand-in, not hashed - a deliberate scope call, not an oversight.
- `src/chat.js`'s `createLineQueue` exists because `rl.question()` attaches its listener only when called: two questions asked back-to-back with no async work in between (the login prompt) can drop the second answer if both arrive before the second question is asked (fast typing, or a paste). The chat loop doesn't need this - an LLM call always separates its questions, giving plenty of time. Don't revert the login prompt to plain `rl.question()` calls.
- `src/agent.js`'s graph state is a custom `Annotation.Root` combining `MessagesAnnotation.spec` with a second channel, `toolActivity` (reducer: concat, default: `[]` - resets every `graph.invoke()` call since it isn't part of the `messages` input). `callTools` pushes `{name, args, result}` per call; `callModel` never touches it. `runAgentTurn` returns `{ message, toolActivity }`, not just the final message - `src/chat.js` destructures `.message` and ignores the rest; `src/server/routes.js`'s `/api/chat` sends both to the frontend, which is what the agent-activity panel renders.
- `server.js` is a pure API - it never serves `client/dist` or any frontend file. The frontend is always a separate process: `cd client && npm run dev` for development, or `npm run build && npm run preview` for a standalone production-like run on its own port. Don't add static-file serving back into `server.js` for convenience - that was deliberately removed.
- `client/src/api.ts`'s `API_BASE` (from `VITE_API_URL`, typed in `client/src/vite-env.d.ts`) is the one and only mechanism the frontend uses to find the API, in every mode - dev, preview, and real deployment alike. There is no dev proxy (deliberately removed from `client/vite.config.ts`, along with the `.env`-based `VITE_API_URL` default it used to shortcut); `client/.env.example`'s `VITE_API_URL=http://localhost:3001` is the default every mode relies on, copied once to `client/.env` (Vite loads `.env` automatically, dev included). `server.js`'s `CORS_ORIGIN` is the matching piece on the backend side - unset, any origin is allowed (fine on localhost). Change both to the real URLs for a genuine separate deployment. Verified directly: built the frontend with `VITE_API_URL=http://localhost:3001`, served it standalone via `vite preview` on a different port (4173), and confirmed a real cross-origin login succeeds with the correct `Access-Control-Allow-Origin` header - and confirmed the proxy's removal actually took (a direct request to the dev server's `/api/login` 404s, proving nothing intercepts it anymore).

## Current limitations

- `leave_history` is seeded but no tool reads it yet (a future eligibility refinement, e.g. "has this employee already taken EL this quarter").
- The server's conversation history (`src/server/conversations.js`) is in-memory, per-employee, and lost on restart - a deliberate choice for this assessment (see README Step 8), not a bug.
