// All HR tools the agent can call, plus the name -> tool map used to run
// whatever the model requests (src/agent.js) and to bind them to the
// model. Business logic lives here; data access goes through
// src/db/repository.js, never straight to the database.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getEmployee, getLeaveBalance, listHolidays } from "../db/repository.js";
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
      results: results.map((r) => ({ page: r.page, text: r.text })),
    });
  },
  {
    name: "search_hr_policy",

    description:
      "Search the HR leave policy document for rules about a topic (e.g. casual leave, sick leave, earned leave, PL to EL conversion, maternity, paternity, holidays). Returns the most relevant passages from the real policy PDF, each with the page number it came from - cite the page in your answer.",

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

const checkLeaveEligibilityTool = tool(
  async ({ leaveType, startDate, endDate }) => {
    console.log("\n🛠 check_leave_eligibility tool executed");

    // Same rule as the other self-service tools: the ID comes from the
    // session, never from a model argument.
    const employeeId = getCurrentEmployeeId();
    const employee = getEmployee(employeeId);
    if (!employee) {
      return JSON.stringify({ error: `No employee found with id ${employeeId}` });
    }

    const requestedDays = countWorkingDays(startDate, endDate);

    // Per policy (leave-policy.pdf, section 5): employees serving notice
    // period cannot take CL, SL, EL or PL, regardless of balance. This
    // check is why this tool exists - left to its own judgment, the model
    // doesn't reliably remember to look up employment status (see
    // CLAUDE.md's "Current limitations" / the plan's tested evidence).
    if (employee.status === "notice_period") {
      return JSON.stringify({
        eligible: false,
        reason: `Employee is serving notice period; ${leaveType} cannot be availed during notice period, regardless of balance.`,
        leaveType,
        requestedDays,
        employeeStatus: employee.status,
      });
    }

    const balance = getLeaveBalance(employeeId);
    if (!balance) {
      return JSON.stringify({ error: `No leave balance found for employee ${employeeId}` });
    }

    const balanceField = LEAVE_TYPE_TO_BALANCE_FIELD[leaveType];
    const availableBalance = balance[balanceField];
    const eligible = requestedDays <= availableBalance;

    return JSON.stringify({
      eligible,
      reason: eligible
        ? `Sufficient ${leaveType} balance for the requested ${requestedDays} day(s).`
        : `Requested ${requestedDays} day(s) exceeds available ${leaveType} balance of ${availableBalance}.`,
      leaveType,
      requestedDays,
      availableBalance,
      employeeStatus: employee.status,
    });
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

// Name -> tool, so adding a new tool is a one-line change here and in
// agent.js's bindTools - no extra `if` branches needed.
export const toolsByName = {
  get_leave_balance: getLeaveBalanceTool,
  calculate_leave_days: calculateLeaveDaysTool,
  search_hr_policy: searchHRPolicyTool,
  get_employee_profile: getEmployeeProfileTool,
  get_holidays: getHolidaysTool,
  check_leave_eligibility: checkLeaveEligibilityTool,
};
