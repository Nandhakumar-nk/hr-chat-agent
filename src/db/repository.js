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
