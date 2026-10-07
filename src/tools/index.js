// All HR tools the agent can call, plus the name -> tool map used to run
// whatever the model requests (src/agent.js) and to bind them to the
// model. Business logic lives here; data access goes through
// src/db/repository.js, never straight to the database.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import {
  getEmployee,
  getLeaveBalance,
  listHolidays,
  getActiveLoan,
  getLastClosedLoan,
  countLoansInFinancialYear,
  recordApprovedLeave,
} from "../db/repository.js";
import { retrieve } from "../rag/index.js";
import { getCurrentEmployeeId } from "../session.js";

const getLeaveBalanceTool = tool(
  async () => {
    console.log("\n🛠 get_leave_balance tool executed");

    // employeeId comes from the logged-in session, never as a model
    // argument (step 7) - there is no parameter here the model could use
    // to ask for someone else's balance.
    const employeeId = getCurrentEmployeeId();
    const balance = getLeaveBalance(employeeId);
    if (!balance) {
      return JSON.stringify({ error: `No leave balance found for employee ${employeeId}` });
    }

    return JSON.stringify({
      employeeId,
      casualLeave: balance.casual_leave,
      sickLeave: balance.sick_leave,
      earnedLeave: balance.earned_leave,
      privilegeLeave: balance.privilege_leave,
    });
  },
  {
    name: "get_leave_balance",

    description:
      "Get the current Casual Leave (CL), Sick Leave (SL), Earned Leave (EL) and legacy Privilege Leave (PL) balance of the authenticated employee. There is no employeeId parameter - this always returns the logged-in employee's own balance, never another employee's.",

    schema: z.object({}),
  }
);

// Shared by calculate_leave_days and check_leave_eligibility: the working
// days in [startDate, endDate], inclusive, skipping weekends and public
// holidays from the holidays table.
function countWorkingDays(startDate, endDate) {
  const holidayDates = new Set(listHolidays().map((h) => h.date));

  const start = new Date(startDate);
  const end = new Date(endDate);

  let workingDays = 0;
  for (
    let day = new Date(start);
    day <= end;
    day.setDate(day.getDate() + 1)
  ) {
    const weekday = day.getDay(); // 0 = Sunday, 6 = Saturday
    const isoDate = day.toISOString().slice(0, 10);
    if (weekday !== 0 && weekday !== 6 && !holidayDates.has(isoDate)) {
      workingDays++;
    }
  }
  return workingDays;
}

// Shared by check_wfh_eligibility and check_loan_eligibility: completed
// years of tenure from date_of_joining to today.
function tenureYears(dateOfJoining) {
  const joined = new Date(dateOfJoining);
  const now = new Date();
  let years = now.getFullYear() - joined.getFullYear();
  const beforeAnniversary =
    now.getMonth() < joined.getMonth() ||
    (now.getMonth() === joined.getMonth() && now.getDate() < joined.getDate());
  if (beforeAnniversary) years--;
  return years;
}

const calculateLeaveDaysTool = tool(
  async ({ startDate, endDate }) => {
    console.log("\n🛠 calculate_leave_days tool executed");

    const workingDays = countWorkingDays(startDate, endDate);

    return JSON.stringify({
      startDate,
      endDate,
      workingDays,
      note: "Weekends and public holidays excluded.",
    });
  },
  {
    name: "calculate_leave_days",

    description:
      "Calculate how many working days (excluding weekends and public holidays) fall between two dates. Use this whenever the user gives a date range and asks how many leave days it covers.",

    schema: z.object({
      startDate: z.string().describe("Start date, format YYYY-MM-DD"),
      endDate: z.string().describe("End date, format YYYY-MM-DD"),
    }),
  }
);

const searchHRPolicyTool = tool(
  async ({ query }) => {
    console.log("\n🛠 search_hr_policy tool executed");

    const results = await retrieve(query, 3);

    return JSON.stringify({
      query,
      results: results.map((r) => ({ source: r.source, file: r.file, page: r.page, text: r.text })),
    });
  },
  {
    name: "search_hr_policy",

    description:
      "Search the company's HR policy documents for rules about a topic: leave (casual, sick, earned, PL to EL conversion, maternity, paternity, holidays), wedding/newborn gift vouchers, the staff loan policy's general terms, or the work-from-home/hybrid policy's general terms. Returns the most relevant passages, each with the source document and page number - cite both in your answer. For a verdict on whether the employee specifically qualifies for a staff loan or WFH, use check_loan_eligibility or check_wfh_eligibility instead of this search.",

    schema: z.object({
      query: z.string(),
    }),
  }
);

const getEmployeeProfileTool = tool(
  async () => {
    console.log("\n🛠 get_employee_profile tool executed");

    // Same rule as get_leave_balance: the ID comes from the session,
    // never from a model argument.
    const employeeId = getCurrentEmployeeId();
    const employee = getEmployee(employeeId);
    if (!employee) {
      return JSON.stringify({ error: `No employee found with id ${employeeId}` });
    }

    return JSON.stringify({
      employeeId: employee.id,
      name: employee.name,
      department: employee.department,
      dateOfJoining: employee.date_of_joining,
      status: employee.status,
    });
  },
  {
    name: "get_employee_profile",

    description:
      "Get the authenticated employee's own profile: name, department, date of joining and employment status (active or serving notice period). There is no employeeId parameter - this always returns the logged-in employee's own profile, never another employee's.",

    schema: z.object({}),
  }
);

const getHolidaysTool = tool(
  async () => {
    console.log("\n🛠 get_holidays tool executed");

    return JSON.stringify({ holidays: listHolidays() });
  },
  {
    name: "get_holidays",

    description: "Get the company's public holiday list.",

    schema: z.object({}),
  }
);

// Maps a requested leave type onto its column in leave_balances.
const LEAVE_TYPE_TO_BALANCE_FIELD = {
  CL: "casual_leave",
  SL: "sick_leave",
  EL: "earned_leave",
  PL: "privilege_leave",
};

// Shared by check_leave_eligibility and submit_leave_request, so both give
// identical verdicts from one source of truth instead of two copies that
// could drift. submit_leave_request calls this again right before writing,
// even though the conversation should already have checked - a defense in
// depth guard against a confirmed-but-actually-ineligible request (the
// model skipped the check, or the balance changed between turns).
function evaluateLeaveEligibility(employeeId, leaveType, startDate, endDate) {
  const employee = getEmployee(employeeId);
  if (!employee) {
    return { error: `No employee found with id ${employeeId}` };
  }

  const requestedDays = countWorkingDays(startDate, endDate);

  // Per policy (leave-policy.pdf, section 5): employees serving notice
  // period cannot take CL, SL, EL or PL, regardless of balance. This
  // check is why check_leave_eligibility exists - left to its own
  // judgment, the model doesn't reliably remember to look up employment
  // status (see CLAUDE.md's "Current limitations" / the plan's tested
  // evidence).
  if (employee.status === "notice_period") {
    return {
      eligible: false,
      reason: `Employee is serving notice period; ${leaveType} cannot be availed during notice period, regardless of balance.`,
      leaveType,
      requestedDays,
      employeeStatus: employee.status,
    };
  }

  const balance = getLeaveBalance(employeeId);
  if (!balance) {
    return { error: `No leave balance found for employee ${employeeId}` };
  }

  const balanceField = LEAVE_TYPE_TO_BALANCE_FIELD[leaveType];
  const availableBalance = balance[balanceField];
  const eligible = requestedDays <= availableBalance;

  return {
    eligible,
    reason: eligible
      ? `Sufficient ${leaveType} balance for the requested ${requestedDays} day(s).`
      : `Requested ${requestedDays} day(s) exceeds available ${leaveType} balance of ${availableBalance}.`,
    leaveType,
    requestedDays,
    availableBalance,
    balanceField,
    employeeStatus: employee.status,
  };
}

const checkLeaveEligibilityTool = tool(
  async ({ leaveType, startDate, endDate }) => {
    console.log("\n🛠 check_leave_eligibility tool executed");

    const employeeId = getCurrentEmployeeId();
    const result = evaluateLeaveEligibility(employeeId, leaveType, startDate, endDate);
    return JSON.stringify(result);
  },
  {
    name: "check_leave_eligibility",

    description:
      "Check whether the authenticated employee is eligible to take a specific type of leave over a date range. Combines employment status (notice period blocks all leave), the leave balance, and the working-day count into one eligibility verdict with a reason. Use this for any question asking whether leave 'can' be taken, not just the balance or the day count alone. There is no employeeId parameter - this always checks the logged-in employee, never another employee.",

    schema: z.object({
      leaveType: z.enum(["CL", "SL", "EL", "PL"]),
      startDate: z.string().describe("Start date, format YYYY-MM-DD"),
      endDate: z.string().describe("End date, format YYYY-MM-DD"),
    }),
  }
);

const submitLeaveRequestTool = tool(
  async ({ leaveType, startDate, endDate, confirmed }) => {
    console.log("\n🛠 submit_leave_request tool executed");

    if (confirmed !== true) {
      return JSON.stringify({
        submitted: false,
        reason:
          "Not submitted: this tool only runs with confirmed=true. State the exact leave type, date range and that confirming means immediate approval and an immediate balance deduction, then ask the employee to explicitly confirm before calling this again.",
      });
    }

    const employeeId = getCurrentEmployeeId();

    // Re-verify eligibility server-side even though the conversation
    // should already have checked - see evaluateLeaveEligibility's comment.
    const verdict = evaluateLeaveEligibility(employeeId, leaveType, startDate, endDate);
    if (verdict.error) {
      return JSON.stringify(verdict);
    }
    if (!verdict.eligible) {
      return JSON.stringify({ submitted: false, ...verdict });
    }

    const { id, balance } = recordApprovedLeave(
      employeeId,
      leaveType,
      startDate,
      endDate,
      verdict.balanceField,
      verdict.requestedDays
    );

    return JSON.stringify({
      submitted: true,
      requestId: id,
      leaveType,
      startDate,
      endDate,
      requestedDays: verdict.requestedDays,
      status: "approved",
      updatedBalance: {
        casualLeave: balance.casual_leave,
        sickLeave: balance.sick_leave,
        earnedLeave: balance.earned_leave,
        privilegeLeave: balance.privilege_leave,
      },
    });
  },
  {
    name: "submit_leave_request",

    description:
      "Submit a leave request for the authenticated employee - the only tool that writes data, not just reads it. Requires confirmed=true, which must only be set after the employee has explicitly confirmed the exact leave type, date range, and that confirming means IMMEDIATE approval and an IMMEDIATE balance deduction (there is no separate approval step in this system) - never set confirmed=true on the first ask. If confirmed, this re-checks eligibility itself and refuses to write if the employee is actually ineligible (e.g. notice period, insufficient balance). There is no employeeId parameter - this always acts on the logged-in employee, never another employee.",

    schema: z.object({
      leaveType: z.enum(["CL", "SL", "EL", "PL"]),
      startDate: z.string().describe("Start date, format YYYY-MM-DD"),
      endDate: z.string().describe("End date, format YYYY-MM-DD"),
      confirmed: z
        .boolean()
        .describe("Must be true, and only true after the employee explicitly confirmed this exact request."),
    }),
  }
);

const checkWfhEligibilityTool = tool(
  async () => {
    console.log("\n🛠 check_wfh_eligibility tool executed");

    const employeeId = getCurrentEmployeeId();
    const employee = getEmployee(employeeId);
    if (!employee) {
      return JSON.stringify({ error: `No employee found with id ${employeeId}` });
    }

    const years = tenureYears(employee.date_of_joining);

    let eligible;
    let reason;
    if (years < 1) {
      eligible = false;
      reason = `Under 1 year of tenure (${years} year(s)); work-from-home-policy.pdf excludes employees with 0-1 year of experience.`;
    } else if (years < 2) {
      eligible = false;
      reason = `${years} year(s) of tenure is in the 1-2 year band, which is not eligible by default. An exception can be granted case-by-case for exceptional performance, with manager and HR approval.`;
    } else {
      eligible = true;
      reason = `${years} year(s) of tenure meets the 2-year threshold for WFH/hybrid eligibility.`;
    }

    return JSON.stringify({
      eligible,
      reason,
      tenureYears: years,
      dayQuota: "Up to 2 days/week, 8 days/month, set by the Project Manager, no carry-forward. Extra WFH days beyond the quota are deducted from CL/PL, or treated as Leave Without Pay (LOP) if no balance is available.",
      note: "Role-based exclusions (senior leadership, support roles, employees in training, critical/red projects) are not tracked in this system and must be confirmed manually - this verdict covers tenure only.",
      employeeStatus: employee.status,
    });
  },
  {
    name: "check_wfh_eligibility",

    description:
      "Check whether the authenticated employee is eligible for work-from-home/hybrid arrangements, based on tenure (work-from-home-policy.pdf). Also returns the WFH day quota and what happens if it's exceeded. There is no employeeId parameter - this always checks the logged-in employee, never another employee. Note the result also flags eligibility criteria this system cannot check (role, training status, project criticality) - mention those as needing manual confirmation.",

    schema: z.object({}),
  }
);

const checkLoanEligibilityTool = tool(
  async () => {
    console.log("\n🛠 check_loan_eligibility tool executed");

    const employeeId = getCurrentEmployeeId();
    const employee = getEmployee(employeeId);
    if (!employee) {
      return JSON.stringify({ error: `No employee found with id ${employeeId}` });
    }

    const years = tenureYears(employee.date_of_joining);
    const today = new Date().toISOString().slice(0, 10);

    const reasons = [];
    if (years < 1) {
      reasons.push(`Employment must be confirmed and completed by a minimum of 1 year (current tenure: ${years} year(s)).`);
    }
    if (employee.ctc > 2000000) {
      reasons.push(`CTC of ${employee.ctc} exceeds the 20,00,000 eligibility cap.`);
    }

    const activeLoan = getActiveLoan(employeeId);
    if (activeLoan) {
      reasons.push(`An existing loan (disbursed ${activeLoan.disbursed_date}) is still active - a new loan requires 100% repayment of the previous one first.`);
    }

    const lastClosedLoan = getLastClosedLoan(employeeId);
    if (lastClosedLoan) {
      const monthsSinceClosed =
        (new Date(today) - new Date(lastClosedLoan.closed_date)) / (1000 * 60 * 60 * 24 * 30);
      if (monthsSinceClosed < 6) {
        reasons.push(`Previous loan closed on ${lastClosedLoan.closed_date}, under the required 6-month gap before a new loan.`);
      }
    }

    const loansThisYear = countLoansInFinancialYear(employeeId, today);
    if (loansThisYear >= 1) {
      reasons.push(`Already availed ${loansThisYear} loan(s) in this financial year (maximum 1 per financial year).`);
    }

    const eligible = reasons.length === 0;

    return JSON.stringify({
      eligible,
      reason: eligible
        ? "Meets tenure, CTC, and repayment-gap requirements for a new staff loan."
        : reasons.join(" "),
      tenureYears: years,
      ctc: employee.ctc,
      maxLoanAmount: eligible ? 200000 : undefined,
      maxTenureMonths: eligible ? 12 : undefined,
      employeeStatus: employee.status,
    });
  },
  {
    name: "check_loan_eligibility",

    description:
      "Check whether the authenticated employee is eligible for a new staff loan (staff-loan-policy.pdf): tenure, CTC cap (20 lakhs), no currently active loan, a 6-month gap since the last loan closed, and at most 1 loan per financial year. Returns the max loan amount and repayment period when eligible. There is no employeeId parameter - this always checks the logged-in employee, never another employee.",

    schema: z.object({}),
  }
);

// Name -> tool, so adding a new tool is a one-line change here and in
// agent.js's bindTools - no extra `if` branches needed.
export const toolsByName = {
  get_leave_balance: getLeaveBalanceTool,
  calculate_leave_days: calculateLeaveDaysTool,
  search_hr_policy: searchHRPolicyTool,
  get_employee_profile: getEmployeeProfileTool,
  get_holidays: getHolidaysTool,
  check_leave_eligibility: checkLeaveEligibilityTool,
  check_wfh_eligibility: checkWfhEligibilityTool,
  check_loan_eligibility: checkLoanEligibilityTool,
  submit_leave_request: submitLeaveRequestTool,
};
