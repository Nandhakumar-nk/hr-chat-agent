// JWT issuance and verification, plus the Express middleware that opens
// a per-request session. This is the real version of step 7's
// authentication: a CLI process is one continuous run, so an in-process
// session variable was a reasonable stand-in; a server handles many
// people's requests, often concurrently, so identity has to be verified
// independently on every single request - that's what a JWT is for.
//
// withSession/getCurrentEmployeeId (src/session.js) are unchanged by
// this file - tools still call getCurrentEmployeeId() with no
// arguments. This file is just a new, HTTP-specific way of calling
// withSession once per request instead of once per CLI run.

import jwt from "jsonwebtoken";
import { authenticate, withSession } from "../session.js";
import { getEmployee } from "../db/repository.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-only-insecure-secret";
const TOKEN_TTL = "12h";

if (!process.env.JWT_SECRET) {
  console.warn(
    "Warning: JWT_SECRET is not set - using an insecure default. Set it in .env before deploying this anywhere real."
  );
}

export function login(employeeId, password) {
  const employee = authenticate(employeeId, password); // throws on bad credentials
  const token = jwt.sign({ sub: employee.id }, JWT_SECRET, { expiresIn: TOKEN_TTL });
  return { token, employee };
}

// Express middleware: verifies the Authorization: Bearer <token> header,
// re-fetches the real employee row for the ID it claims (never trust a
// token's claim beyond the ID itself - status, name etc. could have
// changed since it was issued), and runs the rest of this request's
// handling inside its own withSession call. Two concurrent requests from
// different employees each get their own isolated session - neither can
// ever see the other's identity, regardless of timing.
export function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
  }

  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  // Re-fetch the current row for the ID the token claims - never trust
  // anything beyond that ID itself; status, name etc. could have
  // changed since the token was issued.
  const employee = getEmployee(payload.sub);
  if (!employee) {
    return res.status(401).json({ error: "Employee no longer exists." });
  }

  withSession(employee, () => next());
}
