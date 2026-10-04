// Renders the tools a single agent turn called - directly answering the
// roadmap's "agent activity panel that shows which tools were called and
// why". The data comes straight from src/agent.js's toolActivity graph
// channel (step 8), passed through unmodified by the /api/chat route.

import type { ToolActivityEntry } from "./api";

export function ActivityPanel({ activity }: { activity: ToolActivityEntry[] }) {
  if (activity.length === 0) {
    return null;
  }

  return (
    <details className="activity-panel">
      <summary>
        Agent activity ({activity.length} tool call{activity.length === 1 ? "" : "s"})
      </summary>
      <ul>
        {activity.map((entry, i) => (
          <li key={i}>
            <div className="tool-name">{entry.name}</div>
            {Object.keys(entry.args).length > 0 && (
              <div className="args">args: {JSON.stringify(entry.args)}</div>
            )}
            <pre className="result">{formatResult(entry.result)}</pre>
          </li>
        ))}
      </ul>
    </details>
  );
}

function formatResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
}
