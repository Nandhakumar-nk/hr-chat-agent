// The authenticated employee's identity for this CLI run. This is the
// one place that's allowed to decide "who is this" - tools read it from
// here, never from a model-supplied argument (that's the whole point of
// step 7). Real session/token handling (JWT, cookies, verified on every
// request) is step 8's job, once there's an actual HTTP boundary between
// a frontend and a backend; a CLI process has no such boundary to
// protect, so this is a minimal, demo-appropriate stand-in for the same
// architectural principle: identity comes from the session, not from
// whatever the model (or the user talking to it) claims.

import { getEmployee } from "./db/repository.js";

let currentEmployee = null;

export function login(employeeId, password) {
  const employee = getEmployee(employeeId);

  // Don't reveal whether the ID or the password was wrong - standard
  // practice, and it costs nothing here.
  if (!employee || employee.password !== password) {
    throw new Error("Invalid employee ID or password.");
  }

  currentEmployee = employee;
  return employee;
}

export function getCurrentEmployeeId() {
  if (!currentEmployee) {
    // A tool ran before login - a real bug, not something to paper over
    // with a silent default.
    throw new Error("No employee is logged in yet.");
  }
  return currentEmployee.id;
}
