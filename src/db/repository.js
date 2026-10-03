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
