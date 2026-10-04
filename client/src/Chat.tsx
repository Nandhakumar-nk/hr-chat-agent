import { useState, type FormEvent } from "react";
import { sendMessage, type Employee, type ChatMessage } from "./api";
import { ActivityPanel } from "./ActivityPanel";

export function Chat({
  employee,
  onLogout,
}: {
  employee: Employee;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setSending(true);
    setError(null);

    try {
      const { answer, toolActivity } = await sendMessage(text);
      setMessages((m) => [...m, { role: "agent", text: answer, toolActivity }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="chat">
      <header>
        <span>
          Logged in as <strong>{employee.name}</strong> ({employee.id})
        </span>
        <button className="logout" onClick={onLogout}>
          Log out
        </button>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <p className="hint">Ask about your leave balance, policy, or eligibility.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">{m.text}</div>
            {m.role === "agent" && m.toolActivity && <ActivityPanel activity={m.toolActivity} />}
          </div>
        ))}
        {sending && (
          <div className="message agent">
            <div className="bubble">...</div>
          </div>
        )}
      </div>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about your leave..."
          autoFocus
        />
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
