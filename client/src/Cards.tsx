// Dashboard info cards - each fetches its own data directly from the
// REST endpoints (no LLM involved), the same "fast, deterministic read"
// reasoning as the backend's /api/leave-balance and /api/holidays.

import { useEffect, useState } from "react";
import { getLeaveBalance, getHolidays, type Employee, type LeaveBalance, type Holiday } from "./api";

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

export function UpcomingHolidaysCard() {
  const [holidays, setHolidays] = useState<Holiday[] | null>(null);

  useEffect(() => {
    getHolidays()
      .then(setHolidays)
      .catch(() => setHolidays([]));
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (holidays ?? []).filter((h) => h.date >= today).slice(0, 4);

  return (
    <div className="card">
      <h3>Upcoming Holidays</h3>
      {!holidays ? (
        <p className="hint">Loading...</p>
      ) : upcoming.length === 0 ? (
        <p className="hint">No upcoming holidays this year.</p>
      ) : (
        <ul className="holiday-list">
          {upcoming.map((h) => (
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
