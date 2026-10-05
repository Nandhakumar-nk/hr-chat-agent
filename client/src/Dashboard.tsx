import { Logo } from "./Logo";
import { Sidebar } from "./Sidebar";
import { ProfileCard, LeaveBalanceCard, UpcomingHolidaysCard } from "./Cards";
import { ChatAssistant } from "./ChatAssistant";
import { ThemeToggle } from "./ThemeToggle";
import type { Employee } from "./api";

export function Dashboard({ employee, onLogout }: { employee: Employee; onLogout: () => void }) {
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
        <Sidebar />

        <main className="dashboard-main">
          <h1>Welcome, {employee.name.split(" ")[0]}!</h1>
          <div className="cards">
            <ProfileCard employee={employee} />
            <LeaveBalanceCard />
            <UpcomingHolidaysCard />
          </div>
        </main>
      </div>

      <ChatAssistant />
    </div>
  );
}
