# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

An HR chat agent built step by step with LangChain JS and Google Gemini, as a learning project for an Agentic AI assessment. The README documents each step. Update it whenever a step is added.

## How we work: learning project

This is the developer's first agent-building project, and they are learning as they build. They already know React, Node.js, databases and APIs, and they know Claude's agent and tool concepts. What's new to them is how an LLM chooses and calls tools, agent loops, and RAG.

- Build in small steps. Each step adds one new concept, runs end to end, and gets its own commit and README section.
- Before coding a step, explain the concept and why it's needed. After it runs, show the observed behavior, such as the `tool_calls` the model chose, and point out what is still missing.
- Keep code readable and heavily commented. Prefer plain LangChain JS over abstractions that hide the tool-calling loop. Use LangGraph or extra agents only when a step needs them.
- Don't jump ahead. Finish the current step, then propose the next one from the roadmap and let the developer choose.

Roadmap toward the assessment (deadline Tue Oct 6, 1 PM; deliverables are a public GitHub repo, a demo video and architecture docs). It is judged on implementation, agentic approach, framework usage, tool integration, architecture and completeness:
1. One agent, one tool (`get_leave_balance`). Done.
2. Several tools (`calculate_leave_days` for working days in a date range, `search_hr_policy` with stubbed text for now), with the model choosing between them and a loop that runs until there are no more tool calls. Done.
3. Context handling: keep the message history across turns in an interactive CLI chat, so follow-ups like "what about 7 days?" work. Done.
4. A SQL database (SQLite) for employees, leave balances, leave history and holidays. Add tools such as `get_employee_profile` and `get_holidays`. Done.
5. RAG over `docs/policies/leave-policy.pdf`: chunk, embed, retrieve, and cite the source page in answers. Done.
6. Move to LangGraph JS. Rebuild the hand-written loop as a graph, now that the loop is understood, and add a `check_leave_eligibility` tool that combines balance, policy rules and date calculation.
7. Authentication: the employee ID comes from the session and never from the LLM. Requesting another employee's data must fail, and the demo shows this.
8. A React chat UI on a Node/Express backend, with an "agent activity" panel that shows which tools were called and why.
9. Docs and demo: a README with an architecture diagram, framework choices, tools and implementation approach. Record the demo video of the key flows: policy question (RAG), balance (DB), date calculation, eligibility (multi-tool), follow-up (context) and authorization failure.

## Source documents (`docs/policies/`)

These are the documents shared with the assessment. They are the source of truth for tool logic, seed data and RAG. The repo is public, so these are redacted copies of the internal PDFs: people's names and contact details are removed, the company is called "the Company", and its internal leave tool is called "the HR portal". All other text is unchanged. The originals are gitignored, so never commit them.

- `leave-policy.pdf`: Leave Policy v1.3 (02-Mar-26). An older v1.2 also exists (20 days a year, no Sick Leave). It is superseded, so don't use it.
- `holiday-list-2026.pdf`: 12 public holidays. Saturdays and Sundays are weekly offs.

Policy rules the tools must implement, not just retrieve:
- Leave types: Casual (CL) 6, Sick (SL) 6 and Earned (EL) 12 days per calendar year, credited quarterly (1.5 + 1.5 + 3). CL and SL lapse at year end. Up to 8 EL days carry forward, and the EL balance is capped at 20. Older employees may also hold legacy Privilege Leave (PL), which doesn't expire.
- Leave day counts skip weekends and the listed holidays (policy section 7.3). `calculate_leave_days` must use the holiday list.
- Employees serving notice can't take CL, SL, EL, PL or WFH, and can't encash EL. Eligibility depends on employee status, so the employees table needs it.
- Calculations stated in the policy: PL-to-EL conversion (keep 6 days if the balance is even or 7 if odd, then convert the rest at 2 PL : 1 EL) and EL encashment (up to 8 days a year, once a year). These are good candidates for deterministic tools.
- Maternity and paternity leave are separate from the annual balances. Answer questions about them from the policy text.

## Commands

```bash
npm install
cp .env.example .env              # set GOOGLE_API_KEY (and optionally GEMINI_MODEL)
npx chroma run --path ./data/chroma  # start the vector DB server first, leave it running
node index.js                     # interactive chat, context kept across turns
node index.js "<question>"        # single-shot: ask one question and exit
```

There are no tests, linter or build step. To verify a change, run `index.js` with questions that should and shouldn't trigger a tool, in both modes. The README lists sample questions. The Google AI free tier caps a model at 20 requests/day; if you hit a `429`, rerun with `GEMINI_MODEL=gemini-3.5-flash-lite` (a separate quota) rather than waiting out the reset. If `search_hr_policy` errors with a connection message, the Chroma server isn't running - start it as shown above.

## Architecture

The code is layered, each layer only talking to the one below it:

```text
index.js            entry point: single-shot vs interactive, nothing else
src/chat.js          presentation: the two CLI modes (node:readline)
src/agent.js         orchestration: the model, bindTools, the runAgentTurn loop
src/tools/index.js   business logic: the tool definitions
src/db/              data access: schema.sql, seed.js, connection.js, repository.js
src/rag/             RAG: pdfLoader.js, embeddings.js, chromaStore.js, index.js (ensureIndexed/retrieve)
```

- Tools never touch the database or Chroma directly - they call functions in `src/db/repository.js` or `src/rag/index.js`. `src/db/connection.js` opens/creates `data/hr.sqlite` (gitignored) and seeds it from `src/db/seed.js` only when `employees` is empty, so re-running never duplicates data.
- `runAgentTurn(messages)` in `src/agent.js` is the whole tool-calling loop: ask the model, run any requested tools (via a `toolsByName` map in `src/tools/index.js` - a new tool is a one-line addition there, no `if` chain), append results, ask again, until no more tool calls. It mutates `messages` in place, which is what lets `src/chat.js`'s interactive mode keep conversation context across turns (step 3) by reusing the same array.
- The model never gets keyword routing. It picks tools from their name, description and schema, so write those carefully.
- The model is chosen with `GEMINI_MODEL`, defaulting to `gemini-3.8-flash`. `GOOGLE_API_KEY` is read from `.env` by `dotenv`, and `.env` is gitignored.
- `src/tools/index.js` is one file because there are only 5 small tools. Split it (e.g. one file per tool) once step 6 adds more and it gets unwieldy - don't do that split pre-emptively.
- Uses `node:sqlite` and `node:readline`, both built into Node.js - avoid adding a dependency for something the runtime already provides.
- `src/rag/` is written directly against `pdf-parse` and the `chromadb` client, not `@langchain/community`'s `PDFLoader`/`Chroma` wrappers - that package was deprecated/sunset by the LangChain team (no replacement exists yet), so don't add it back for convenience later. `@langchain/textsplitters` and `@langchain/google-genai`'s embeddings are unaffected and still used directly.
- Chroma (`src/rag/chromaStore.js`) is the one external process this project depends on - a real local vector-DB server (`npx chroma run --path ./data/chroma`), not embedded in the Node process. `ensureIndexed()` (called once from `index.js`) gives a clear error if it isn't running, rather than a raw stack trace.

## Current limitations

- The employee ID (`EMP001`) is in the system prompt, and the LLM fills it into tool args. In the target design it must come from the authenticated session, never from the model (step 7).
- `leave_history` is seeded but no tool reads it yet, and `employees.status` (active/notice_period) isn't checked by any tool yet (step 6: eligibility).
