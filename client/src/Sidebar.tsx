// A short nav list matching what this app actually does - "Home" is the
// only real view today; the rest are present but inert (no router yet),
// kept to labels this app's scope supports rather than invented modules.

const ITEMS = [
  { label: "Home", icon: "🏠", active: true },
  { label: "Leave Request", icon: "📝", active: false },
  { label: "Leave Balance", icon: "📊", active: false },
  { label: "Profile", icon: "👤", active: false },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      {ITEMS.map((item) => (
        <div key={item.label} className={`sidebar-item ${item.active ? "active" : ""}`}>
          <span className="icon" aria-hidden="true">
            {item.icon}
          </span>
          <span>{item.label}</span>
        </div>
      ))}
    </nav>
  );
}
