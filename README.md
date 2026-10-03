# HR Chat Agent

An HR chat agent built with LangChain JS and Google Gemini, developed step by step.

## Step 1: one agent, one tool

`index.js` gives the LLM a single tool, `get_leave_balance`, and runs one tool-calling round:

```text
User question → LLM decides whether a tool is needed → app runs the tool
             → tool result goes back to the LLM → final answer
```

No `if (question.includes("leave"))` routing: the model chooses the tool from its name, description and schema.

## Setup

```bash
npm install
cp .env.example .env   # then put your Google AI API key in .env
```

## Run

```bash
node index.js                                                    # "How many leaves do I have?"
node index.js "Hi, who are you?"                                 # no tool needed
node index.js "What is my sick leave balance?"                   # tool selected
node index.js "Do I have enough casual leave to take 3 days off?" # balance known, policy rules not yet
```

## Known limitations (next steps)

- Leave data is hardcoded; it will move to a database.
- The LLM fills in `employeeId` from the system prompt. In the real design it must come from the authenticated session, never from the model.
- No HR policy knowledge yet (RAG comes later).
