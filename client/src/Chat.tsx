import { useState, type FormEvent } from "react";
import { sendMessage, type ChatMessage } from "./api";
import { ActivityPanel } from "./ActivityPanel";
import { Markdown } from "./Markdown";

// The message list + input only - no header/logout here. Used inside
// ChatAssistant's drawer or full-page wrapper, which owns its own
// header and the open/closed/maximized state.
export function Chat() {
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
      <div className="messages">
        {messages.length === 0 && (
          <p className="hint">Ask about your leave balance, policy, or eligibility.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">
              {m.role === "agent" ? <Markdown>{m.text}</Markdown> : m.text}
            </div>
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
