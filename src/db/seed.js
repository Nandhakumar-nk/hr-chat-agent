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
  },
  {
    id: "EMP002",
    name: "Vikram Nair",
    department: "Design",
    dateOfJoining: "2021-02-01",
    status: "active",
    password: "vikram123",
  },
  {
    id: "EMP003",
    name: "Priya Menon",
    department: "Sales",
    dateOfJoining: "2024-11-20",
    status: "notice_period",
    password: "priya123",
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
