-- HR Chat Agent database schema.
-- Run once by src/db/connection.js, which uses CREATE TABLE IF NOT EXISTS
-- so re-running on an existing database is always safe.

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY,         -- e.g. 'EMP001'
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  date_of_joining TEXT NOT NULL, -- 'YYYY-MM-DD'
  status TEXT NOT NULL,          -- 'active' | 'notice_period'
  password TEXT NOT NULL,        -- demo-only login credential, see src/session.js (step 7)
  ctc REAL NOT NULL              -- annual CTC in INR, see staff-loan-policy.pdf's eligibility cap
);

CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id TEXT PRIMARY KEY REFERENCES employees(id),
  casual_leave REAL NOT NULL,
  sick_leave REAL NOT NULL,
  earned_leave REAL NOT NULL,
  privilege_leave REAL NOT NULL DEFAULT 0 -- legacy PL, see leave-policy.pdf section 5.1
);

-- Past leave requests. No tool reads this table yet (it's seeded now so a
-- later step - eligibility or leave-history questions - doesn't need a
-- schema migration).
CREATE TABLE IF NOT EXISTS leave_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  leave_type TEXT NOT NULL,   -- 'CL' | 'SL' | 'EL' | 'PL'
  start_date TEXT NOT NULL,   -- 'YYYY-MM-DD'
  end_date TEXT NOT NULL,     -- 'YYYY-MM-DD'
  status TEXT NOT NULL        -- 'approved' | 'pending' | 'rejected'
);

CREATE TABLE IF NOT EXISTS holidays (
  date TEXT PRIMARY KEY, -- 'YYYY-MM-DD'
  name TEXT NOT NULL
);

-- Staff loan history, see staff-loan-policy.pdf: a new loan needs 100%
-- repayment of the previous one plus a 6-month gap, so both the active
-- loan (if any) and the most recently closed one matter for eligibility.
CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id TEXT NOT NULL REFERENCES employees(id),
  amount REAL NOT NULL,
  disbursed_date TEXT NOT NULL, -- 'YYYY-MM-DD'
  closed_date TEXT,             -- 'YYYY-MM-DD', NULL while still active
  status TEXT NOT NULL          -- 'active' | 'closed'
);
