// Per-employee conversation history, in memory (step 8 design choice -
// same idea as the CLI's single `messages` array from step 3, just
// keyed per user since a server can have several people chatting at
// once). Resets if the server restarts - fine for a demo; a real
// product would persist this (e.g. a conversation_messages table,
// alongside the already-seeded-but-unused leave_history table).

import { SYSTEM_PROMPT } from "../agent.js";

const conversations = new Map();

// Returns this employee's message array, creating a fresh one (seeded
// with the system prompt, same as every CLI session) on their first
// message.
export function getConversation(employeeId) {
  if (!conversations.has(employeeId)) {
    conversations.set(employeeId, [{ role: "system", content: SYSTEM_PROMPT }]);
  }
  return conversations.get(employeeId);
}
