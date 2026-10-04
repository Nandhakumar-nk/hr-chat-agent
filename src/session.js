// The authenticated employee's identity - the one place that's allowed
// to decide "who is this". Tools read it from here, never from a
// model-supplied argument (step 7's whole point).
//
// Uses AsyncLocalStorage (node:async_hooks, built in - no new
// dependency) instead of a single module-level variable. A CLI process
// serves one person at a time, so a plain `let currentEmployee` was
// safe there; a server can have several people's requests in flight at
// once, and a shared variable would let one request's identity leak
// into another's mid-flight (step 7's exact bug, reintroduced at the
// concurrency level). AsyncLocalStorage instead binds the employee to
// one call's async chain - every `await` inside `withSession`'s
// callback sees it, nothing outside that chain can.

import { AsyncLocalStorage } from "node:async_hooks";
import { getEmployee } from "./db/repository.js";

const sessionStorage = new AsyncLocalStorage();

// Looks up and validates credentials, without touching the session -
// used both to establish a new session (below) and, on the server, to
// re-verify a JWT's claimed ID against the real row on every request.
export function authenticate(employeeId, password) {
  const employee = getEmployee(employeeId);

  // Don't reveal whether the ID or the password was wrong - standard
  // practice, and it costs nothing here.
  if (!employee || employee.password !== password) {
    throw new Error("Invalid employee ID or password.");
  }

  return employee;
}

// Runs `fn` (and everything it awaits) with `employee` as the current
// session. The CLI calls this once, wrapping its whole run; the Express
// auth middleware calls it once per request, so concurrent requests
// never share an identity.
export function withSession(employee, fn) {
  return sessionStorage.run(employee, fn);
}

export function getCurrentEmployeeId() {
  const employee = sessionStorage.getStore();
  if (!employee) {
    // A tool ran outside any withSession call - a real bug, not
    // something to paper over with a silent default.
    throw new Error("No employee is logged in yet.");
  }
  return employee.id;
}
