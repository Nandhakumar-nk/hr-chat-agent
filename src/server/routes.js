// The HTTP API: login, re-hydration, and chat. Thin wrappers around the
// same src/agent.js and src/session.js used by the CLI - no business
// logic lives here.

import { Router } from "express";

import { login, requireAuth } from "./auth.js";
import { getConversation } from "./conversations.js";
import { getCurrentEmployeeId } from "../session.js";
import { getEmployee, getLeaveBalance, listHolidays } from "../db/repository.js";
import { runAgentTurn } from "../agent.js";

export const router = Router();

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

router.post("/chat", requireAuth, async (req, res) => {
  const { message } = req.body ?? {};
  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Expected a non-empty 'message' string." });
  }

  const messages = getConversation(getCurrentEmployeeId());
  messages.push({ role: "user", content: message });

  try {
    const { message: answer, toolActivity } = await runAgentTurn(messages);
    res.json({ answer: answer.text, toolActivity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "The agent failed to respond. See server logs." });
  }
});
