// The HTTP API: login, re-hydration, and chat. Thin wrappers around the
// same src/agent.js and src/session.js used by the CLI - no business
// logic lives here.

import { Router } from "express";

import { login, requireAuth } from "./auth.js";
import { getConversation } from "./conversations.js";
import { getCurrentEmployeeId } from "../session.js";
import { getEmployee, getLeaveBalance, listHolidays, getLeaveHistory } from "../db/repository.js";
import { runAgentTurn } from "../agent.js";
import { POLICY_DOCUMENTS } from "../rag/index.js";

export const router = Router();

// Step 12 (guardrails): a simple in-memory per-employee rate limit on
// /api/chat - same Map-per-employee pattern as conversations.js's chat
// history. Caps requests before any LLM call or DB write happens, so a
// flood of requests from one employee can't run up API cost or spam
// writes; other employees are unaffected (their own timestamps live
// under their own key).
const CHAT_RATE_LIMIT = 10; // requests
const CHAT_RATE_WINDOW_MS = 60_000; // per rolling window, per employee
const chatRequestLog = new Map(); // employeeId -> recent request timestamps

function isRateLimited(employeeId) {
  const now = Date.now();
  const recent = (chatRequestLog.get(employeeId) ?? []).filter((t) => now - t < CHAT_RATE_WINDOW_MS);
  recent.push(now);
  chatRequestLog.set(employeeId, recent);
  return recent.length > CHAT_RATE_LIMIT;
}

router.post("/login", (req, res) => {
  const { employeeId, password } = req.body ?? {};

  let token;
  let employee;
  try {
    ({ token, employee } = login(employeeId, password));
  } catch (error) {
    return res.status(401).json({ error: error.message });
  }

  res.json({
    token,
    employee: {
      id: employee.id,
      name: employee.name,
      department: employee.department,
      status: employee.status,
    },
  });
});

// Re-hydrates the frontend after a page refresh: the JWT alone doesn't
// carry a display name, so this is how the UI gets it back.
router.get("/me", requireAuth, (req, res) => {
  const employee = getEmployee(getCurrentEmployeeId());
  res.json({
    id: employee.id,
    name: employee.name,
    department: employee.department,
    status: employee.status,
  });
});

// Direct data reads for dashboard cards - no LLM round-trip, same
// reasoning as calculate_leave_days not asking the model to count days
// itself. employeeId still comes only from the session (requireAuth),
// never a request parameter.
router.get("/leave-balance", requireAuth, (req, res) => {
  const balance = getLeaveBalance(getCurrentEmployeeId());
  if (!balance) {
    return res.status(404).json({ error: "No leave balance found." });
  }
  res.json({
    casualLeave: balance.casual_leave,
    sickLeave: balance.sick_leave,
    earnedLeave: balance.earned_leave,
    privilegeLeave: balance.privilege_leave,
  });
});

router.get("/holidays", requireAuth, (req, res) => {
  res.json({ holidays: listHolidays() });
});

router.get("/leave-history", requireAuth, (req, res) => {
  const history = getLeaveHistory(getCurrentEmployeeId());
  res.json({
    history: history.map((h) => ({
      leaveType: h.leave_type,
      startDate: h.start_date,
      endDate: h.end_date,
      status: h.status,
    })),
  });
});

// Static list of the policy documents search_hr_policy indexes - lets
// the Policies tab link to the same PDFs without hand-duplicating the
// list anywhere in the frontend.
router.get("/policies", requireAuth, (req, res) => {
  res.json({
    policies: POLICY_DOCUMENTS.map(({ source, file, description }) => ({ source, file, description })),
  });
});

router.post("/chat", requireAuth, async (req, res) => {
  const employeeId = getCurrentEmployeeId();
  if (isRateLimited(employeeId)) {
    return res.status(429).json({
      error: `Too many requests - limit is ${CHAT_RATE_LIMIT} per minute. Please wait and try again.`,
    });
  }

  const { message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Expected a non-empty 'message' string." });
  }

  const messages = getConversation(employeeId);
  messages.push({ role: "user", content: message });

  try {
    const { message: answer, toolActivity } = await runAgentTurn(messages);
    res.json({ answer: answer.text, toolActivity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "The agent failed to respond. See server logs." });
  }
});
