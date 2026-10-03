// All HR tools the agent can call, plus the name -> tool map used to run
// whatever the model requests (src/agent.js) and to bind them to the
// model. Business logic lives here; data access goes through
// src/db/repository.js, never straight to the database.

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { getEmployee, getLeaveBalance, listHolidays } from "../db/repository.js";

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

// Stand-in for RAG (step 5): a few policy snippets, keyword-matched.
const POLICY_SNIPPETS = [
  {
    keywords: ["casual", "cl"],
    text: "Casual Leave (CL): 6 days per calendar year, credited 1.5 days per quarter. CL cannot be carried forward or encashed; unused CL lapses at the end of the calendar year.",
  },
  {
    keywords: ["sick", "sl"],
    text: "Sick Leave (SL): 6 days per calendar year, credited 1.5 days per quarter. SL cannot be carried forward or encashed; unused SL lapses at the end of the calendar year.",
  },
  {
    keywords: ["earned", "el", "carry", "encash"],
    text: "Earned Leave (EL): 12 days per calendar year, credited 3 days per quarter. Up to 8 unused EL days carry forward to the next year, capped at 20 days total. Up to 8 EL days per year may be encashed through payroll, once per calendar year.",
  },
  {
    keywords: ["maternity"],
    text: "Maternity Leave: eligible employees get 26 weeks of paid leave for the first or second child, 12 weeks for the third or later. Up to 8 weeks may be taken before the expected delivery date.",
  },
  {
    keywords: ["paternity"],
    text: "Paternity Leave: 5 days per delivery or adoption, for the first and second child only, to be taken within 4 weeks of the event.",
  },
  {
    keywords: ["holiday", "weekend", "weekly off"],
    text: "If a public holiday or weekly off falls within an approved leave period, that day is not counted as leave.",
  },
];

const searchHRPolicyTool = tool(
  async ({ query }) => {
    console.log("\n🛠 search_hr_policy tool executed");

    const normalized = query.toLowerCase();
    const matches = POLICY_SNIPPETS.filter((snippet) =>
      snippet.keywords.some((keyword) => normalized.includes(keyword))
    );

    return JSON.stringify({
      query,
      results:
        matches.length > 0
          ? matches.map((m) => m.text)
          : ["No matching policy snippet found for this stub. Real document search (RAG) comes in a later step."],
    });
  },
  {
    name: "search_hr_policy",

    description:
      "Search HR leave policy text for rules about a topic (e.g. casual leave, sick leave, earned leave, maternity, paternity, holidays). This is a stubbed keyword search for now; it will be replaced with real document search (RAG) later.",

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
