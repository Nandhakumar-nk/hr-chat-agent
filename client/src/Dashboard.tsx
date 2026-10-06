import { useState } from "react";
import { Logo } from "./Logo";
import { Sidebar, type Tab } from "./Sidebar";
import { ProfileCard, LeaveBalanceCard, HolidaysCard, LeaveHistoryCard, PoliciesCard } from "./Cards";
import { ChatAssistant } from "./ChatAssistant";
import { ThemeToggle } from "./ThemeToggle";
import type { Employee } from "./api";

const TITLES: Record<Tab, string> = {
  home: "Your Profile",
  balance: "Leave Balance",
  history: "Leave History",
  holidays: "Public Holidays",
  policies: "HR Policies",
};

export function Dashboard({ employee, onLogout }: { employee: Employee; onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>("home");

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="brand">
          <Logo size={32} />
          <span>HR Chat Agent</span>
        </div>
        <div className="header-right">
          <span>
            Logged in as <strong>{employee.name}</strong> ({employee.id})
          </span>
          <ThemeToggle className="theme-toggle-inline" />
          <button className="logout" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <div className="dashboard-body">
        <Sidebar active={tab} onSelect={setTab} />

        <main className="dashboard-main">
          <h1>{TITLES[tab]}</h1>
          <div className="cards">
            {tab === "home" && <ProfileCard employee={employee} />}
            {tab === "balance" && <LeaveBalanceCard />}
            {tab === "history" && <LeaveHistoryCard />}
            {tab === "holidays" && <HolidaysCard />}
            {tab === "policies" && <PoliciesCard />}
          </div>
        </main>
      </div>

      <ChatAssistant />
    </div>
  );
}
