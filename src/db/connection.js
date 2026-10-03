// Opens (creating if needed) data/hr.sqlite, applies the schema, and
// seeds it on first run. Uses node:sqlite, which is built into Node.js -
// no new npm dependency, same reasoning as step 3's use of node:readline.

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { employees, leaveBalances, leaveHistory, holidays } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "..", "data");
const dbPath = path.join(dataDir, "hr.sqlite");

mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(dbPath);

const schema = readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

seedIfEmpty();

function seedIfEmpty() {
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM employees").get();
  if (count > 0) {
    return; // already seeded
  }

  const insertEmployee = db.prepare(
    "INSERT INTO employees (id, name, department, date_of_joining, status) VALUES (?, ?, ?, ?, ?)"
  );
  for (const e of employees) {
    insertEmployee.run(e.id, e.name, e.department, e.dateOfJoining, e.status);
  }

  const insertBalance = db.prepare(
    "INSERT INTO leave_balances (employee_id, casual_leave, sick_leave, earned_leave, privilege_leave) VALUES (?, ?, ?, ?, ?)"
  );
  for (const b of leaveBalances) {
    insertBalance.run(b.employeeId, b.casualLeave, b.sickLeave, b.earnedLeave, b.privilegeLeave);
  }

  const insertHistory = db.prepare(
    "INSERT INTO leave_history (employee_id, leave_type, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)"
  );
  for (const h of leaveHistory) {
    insertHistory.run(h.employeeId, h.leaveType, h.startDate, h.endDate, h.status);
  }

  const insertHoliday = db.prepare("INSERT INTO holidays (date, name) VALUES (?, ?)");
  for (const h of holidays) {
    insertHoliday.run(h.date, h.name);
  }
}

export default db;
