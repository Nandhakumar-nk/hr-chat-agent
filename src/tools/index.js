// All HR tools the agent can call, plus the name -> tool map used to run
// whatever the model requests (src/agent.js) and to bind them to the
// model. Business logic lives here; data access goes through
// src/db/repository.js, never straight to the database.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getEmployee, getLeaveBalance, listHolidays } from "../db/repository.js";
import { retrieve } from "../rag/index.js";

const getLeaveBalanceTool = tool(
  async ({ employeeId }) => {
    console.log("\n🛠 get_leave_balance tool executed");

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
      "Get the current Casual Leave (CL), Sick Leave (SL), Earned Leave (EL) and legacy Privilege Leave (PL) balance of an employee.",

    schema: z.object({
      employeeId: z.string(),
    }),
  }
);

const calculateLeaveDaysTool = tool(
  async ({ startDate, endDate }) => {
    console.log("\n🛠 calculate_leave_days tool executed");

    // Count the working days in [startDate, endDate], inclusive, skipping
    // weekends and public holidays from the holidays table.
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
  async ({ employeeId }) => {
    console.log("\n🛠 get_employee_profile tool executed");

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
      "Get an employee's profile: name, department, date of joining and employment status (active or serving notice period).",

    schema: z.object({
      employeeId: z.string(),
    }),
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

// Name -> tool, so adding a new tool is a one-line change here and in
// agent.js's bindTools - no extra `if` branches needed.
export const toolsByName = {
  get_leave_balance: getLeaveBalanceTool,
  calculate_leave_days: calculateLeaveDaysTool,
  search_hr_policy: searchHRPolicyTool,
  get_employee_profile: getEmployeeProfileTool,
  get_holidays: getHolidaysTool,
};
