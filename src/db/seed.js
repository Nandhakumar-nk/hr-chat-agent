// Seed data for a fresh database. Only inserted once, by connection.js,
// when the `employees` table is empty - re-running the app never
// duplicates rows.
//
// EMP001 keeps the same leave balances used throughout steps 2-3
// (CL 4.5, SL 6, EL 9), so existing README examples stay accurate.
// EMP002/EMP003 are extra fictitious employees - richer seed data for
// later steps (e.g. step 7's authorization checks), not used by any
// tool yet.
//
// `password` is a demo-only login credential (src/session.js), not real
// security - it exists to show the ID-from-session architectural
// principle in a CLI, not to protect anything. Real session/token
// handling is step 8's job, once there's an actual HTTP boundary.

export const employees = [
  {
    id: "EMP001",
    name: "Asha Rao",
    department: "Engineering",
    dateOfJoining: "2023-06-12",
    status: "active",
    password: "asha123",
    ctc: 1500000, // under the 20L staff-loan cap; see loans below for a long-closed loan
  },
  {
    id: "EMP002",
    name: "Vikram Nair",
    department: "Design",
    dateOfJoining: "2021-02-01",
    status: "active",
    password: "vikram123",
    ctc: 2500000, // above the 20L staff-loan cap - the one ineligibility reason for this employee
  },
  {
    id: "EMP003",
    name: "Priya Menon",
    department: "Sales",
    dateOfJoining: "2024-11-20",
    status: "notice_period",
    password: "priya123",
    ctc: 900000, // under cap, but tenure is under 1 year - blocks both the staff loan and WFH tools
  },
];

export const leaveBalances = [
  { employeeId: "EMP001", casualLeave: 4.5, sickLeave: 6, earnedLeave: 9, privilegeLeave: 0 },
  { employeeId: "EMP002", casualLeave: 1.5, sickLeave: 3, earnedLeave: 15, privilegeLeave: 10 },
  { employeeId: "EMP003", casualLeave: 6, sickLeave: 4.5, earnedLeave: 6, privilegeLeave: 0 },
];

export const leaveHistory = [
  { employeeId: "EMP001", leaveType: "CL", startDate: "2026-02-10", endDate: "2026-02-10", status: "approved" },
  { employeeId: "EMP001", leaveType: "SL", startDate: "2026-04-03", endDate: "2026-04-04", status: "approved" },
  { employeeId: "EMP002", leaveType: "EL", startDate: "2026-05-18", endDate: "2026-05-22", status: "approved" },
];

// Staff loan history, see staff-loan-policy.pdf. EMP001's loan closed
// long ago (neither an active loan nor within the 6-month repayment gap),
// so it's eligibility-neutral - demonstrates that old, fully-closed loans
// don't block a new one. EMP002's CTC alone already disqualifies them, so
// this loan's age isn't the deciding factor either. EMP003 has no loan
// history; their tenure already blocks eligibility on its own.
export const loans = [
  { employeeId: "EMP001", amount: 100000, disbursedDate: "2024-03-01", closedDate: "2024-11-01", status: "closed" },
  { employeeId: "EMP002", amount: 150000, disbursedDate: "2022-01-10", closedDate: "2022-10-01", status: "closed" },
];

// All 12 public holidays from docs/policies/holiday-list-2026.pdf.
export const holidays = [
  { date: "2026-01-01", name: "New Year" },
  { date: "2026-01-15", name: "Pongal" },
  { date: "2026-01-26", name: "Republic day" },
  { date: "2026-03-21", name: "Ramzan" },
  { date: "2026-04-14", name: "Tamil New Year" },
  { date: "2026-05-01", name: "May Day" },
  { date: "2026-08-15", name: "Independence Day" },
  { date: "2026-09-14", name: "Vinayakar Chathurthi" },
  { date: "2026-10-02", name: "Gandhi Jayanthi" },
  { date: "2026-10-19", name: "Ayudha Poojai" },
  { date: "2026-11-08", name: "Diwali" },
  { date: "2026-12-25", name: "Christmas" },
];
