// One card per sidebar tab - each fetches its own data directly from the
// REST endpoints (no LLM involved), the same "fast, deterministic read"
// reasoning as the backend's tool-less GET routes. This is deliberately
// the "traditional app" side of the contrast with the chat agent: each
// one is a dedicated page for a single piece of data the agent can also
// just answer in conversation.

import { useEffect, useState } from "react";
import {
  getLeaveBalance,
  getHolidays,
  getLeaveHistory,
  getPolicies,
  policyFileUrl,
  type Employee,
  type LeaveBalance,
  type Holiday,
  type LeaveHistoryEntry,
  type PolicyDoc,
} from "./api";

export function ProfileCard({ employee }: { employee: Employee }) {
  return (
    <div className="card">
      <h3>Profile</h3>
      <dl>
        <div>
          <dt>Name</dt>
          <dd>{employee.name}</dd>
        </div>
        <div>
          <dt>Employee ID</dt>
          <dd>{employee.id}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{employee.department}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className={`status status-${employee.status}`}>
            {employee.status === "notice_period" ? "Notice period" : "Active"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function LeaveBalanceCard() {
  const [balance, setBalance] = useState<LeaveBalance | null>(null);

  useEffect(() => {
    getLeaveBalance()
      .then(setBalance)
      .catch(() => setBalance(null));
  }, []);

  return (
    <div className="card">
      <h3>Leave Balance</h3>
      {!balance ? (
        <p className="hint">Loading...</p>
      ) : (
        <ul className="balance-list">
          <li>
            <span>Casual Leave</span>
            <strong>{balance.casualLeave}</strong>
          </li>
          <li>
            <span>Sick Leave</span>
            <strong>{balance.sickLeave}</strong>
          </li>
          <li>
            <span>Earned Leave</span>
            <strong>{balance.earnedLeave}</strong>
          </li>
          {balance.privilegeLeave > 0 && (
            <li>
              <span>Privilege Leave</span>
              <strong>{balance.privilegeLeave}</strong>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// Full list - a dedicated tab shows everything, not the dashboard
// widget's "next few upcoming" truncation.
export function HolidaysCard() {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);

  useEffect(() => {
    getHolidays()
      .then(setHolidays)
      .catch(() => setHolidays([]));
  }, []);

  return (
    <div className="card">
      <h3>Public Holidays</h3>
      {!holidays ? (
        <p className="hint">Loading...</p>
      ) : holidays.length === 0 ? (
        <p className="hint">No holidays found.</p>
      ) : (
        <ul className="holiday-list">
          {holidays.map((h) => (
            <li key={h.date}>
              <span>{h.name}</span>
              <span className="date">
                {new Date(h.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LeaveHistoryCard() {
  const [history, setHistory] = useState<LeaveHistoryEntry[] | null>(null);

  useEffect(() => {
    getLeaveHistory()
      .then(setHistory)
      .catch(() => setHistory([]));
  }, []);

  return (
    <div className="card">
      <h3>Leave History</h3>
      {!history ? (
        <p className="hint">Loading...</p>
      ) : history.length === 0 ? (
        <p className="hint">No past leave requests.</p>
      ) : (
        <ul className="holiday-list">
          {history.map((h, i) => (
            <li key={i}>
              <span>
                {h.leaveType} &middot; {h.startDate} to {h.endDate}
              </span>
              <span className={`leave-status leave-status-${h.status}`}>{h.status}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PoliciesCard() {
  const [policies, setPolicies] = useState<PolicyDoc[] | null>(null);

  useEffect(() => {
    getPolicies()
      .then(setPolicies)
      .catch(() => setPolicies([]));
  }, []);

  if (!policies) {
    return (
      <div className="card">
        <h3>HR Policies</h3>
        <p className="hint">Loading...</p>
      </div>
    );
  }

  return (
    <>
      {policies.map((p) => (
        <div className="card" key={p.file}>
          <h3>
            <a href={policyFileUrl(p.file)} target="_blank" rel="noreferrer">
              {p.source}
            </a>
          </h3>
          <p className="hint">{p.description}</p>
        </div>
      ))}
    </>
  );
}
