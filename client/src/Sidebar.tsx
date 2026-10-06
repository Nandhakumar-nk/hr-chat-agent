// One item per real data capability this app has - each a clickable tab
// (controlled by Dashboard, which owns the active-tab state) showing
// only that tab's data. This is the "traditional app" side of the
// contrast with the chat agent: separate pages for things the agent can
// just answer in one message.

export type Tab = "home" | "balance" | "history" | "holidays" | "policies";

const ITEMS: { tab: Tab; label: string; icon: string }[] = [
  { tab: "home", label: "Home", icon: "🏠" },
  { tab: "balance", label: "Leave Balance", icon: "📊" },
  { tab: "history", label: "Leave History", icon: "📝" },
  { tab: "holidays", label: "Holidays", icon: "📅" },
  { tab: "policies", label: "Policies", icon: "📄" },
];

export function Sidebar({ active, onSelect }: { active: Tab; onSelect: (tab: Tab) => void }) {
  return (
    <nav className="sidebar">
      {ITEMS.map((item) => (
        <div
          key={item.tab}
          className={`sidebar-item ${item.tab === active ? "active" : ""}`}
          onClick={() => onSelect(item.tab)}
          role="button"
          tabIndex={0}
        >
          <span className="icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  );
}
