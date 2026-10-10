// Data-access layer: every query the rest of the app needs, in one place.
// Tools (src/tools/index.js) call these functions - they never touch the
// database connection or write SQL themselves.

import db from "./connection.js";

export function getEmployee(employeeId) {
  return db.prepare("SELECT * FROM employees WHERE id = ?").get(employeeId) ?? null;
}

export function getLeaveBalance(employeeId) {
  return db
    .prepare("SELECT * FROM leave_balances WHERE employee_id = ?")
    .get(employeeId) ?? null;
}

export function listHolidays() {
  return db.prepare("SELECT * FROM holidays ORDER BY date").all();
}

export function getLeaveHistory(employeeId) {
  return db
    .prepare("SELECT * FROM leave_history WHERE employee_id = ? ORDER BY start_date DESC")
    .all(employeeId);
}

// Records an auto-approved leave request: inserts the history row and
// deducts the balance in one transaction, so a request is never written
// without its matching deduction (or vice versa). `balanceColumn` is
// interpolated directly into the UPDATE - SQLite can't parameterize
// column names - but it's always one of the 4 fixed, hardcoded columns
// from src/tools/index.js's LEAVE_TYPE_TO_BALANCE_FIELD map, keyed by a
// zod-validated 4-value enum, never raw input.
export function recordApprovedLeave(employeeId, leaveType, startDate, endDate, balanceColumn, requestedDays) {
  db.exec("BEGIN");
  try {
    const insert = db
      .prepare(
        "INSERT INTO leave_history (employee_id, leave_type, start_date, end_date, status) VALUES (?, ?, ?, ?, 'approved')"
      )
      .run(employeeId, leaveType, startDate, endDate);

    db.prepare(`UPDATE leave_balances SET ${balanceColumn} = ${balanceColumn} - ? WHERE employee_id = ?`).run(
      requestedDays,
      employeeId
    );

    const balance = db.prepare("SELECT * FROM leave_balances WHERE employee_id = ?").get(employeeId);

    db.exec("COMMIT");
    return { id: insert.lastInsertRowid, balance };
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

// Step 11: one durable row per agent turn, for observability - what
// console.log used to be the only record of. Called once per turn from
// runAgentTurn (src/agent.js), after the graph finishes.
export function recordTrace({ employeeId, startedAt, userMessage, finalAnswer, toolCalls, totalTokens, latencyMs }) {
  db.prepare(
    `INSERT INTO agent_traces (employee_id, started_at, user_message, final_answer, tool_calls, total_tokens, latency_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(employeeId, startedAt, userMessage, finalAnswer, JSON.stringify(toolCalls), totalTokens ?? null, latencyMs);
}

export function getActiveLoan(employeeId) {
  return (
    db
      .prepare("SELECT * FROM loans WHERE employee_id = ? AND status = 'active'")
      .get(employeeId) ?? null
  );
}

export function getLastClosedLoan(employeeId) {
  return (
    db
      .prepare(
        "SELECT * FROM loans WHERE employee_id = ? AND status = 'closed' ORDER BY closed_date DESC LIMIT 1"
      )
      .get(employeeId) ?? null
  );
}

// Loans disbursed within the Indian financial year (Apr 1 - Mar 31)
// that `asOfDate` falls in - staff-loan-policy.pdf caps new loans at 1
// per financial year.
export function countLoansInFinancialYear(employeeId, asOfDate) {
  const asOf = new Date(asOfDate);
  const fyStartYear = asOf.getMonth() >= 3 ? asOf.getFullYear() : asOf.getFullYear() - 1;
  const fyStart = `${fyStartYear}-04-01`;
  const fyEnd = `${fyStartYear + 1}-03-31`;

  const { count } = db
    .prepare(
      "SELECT COUNT(*) AS count FROM loans WHERE employee_id = ? AND disbursed_date BETWEEN ? AND ?"
    )
    .get(employeeId, fyStart, fyEnd);
  return count;
}
