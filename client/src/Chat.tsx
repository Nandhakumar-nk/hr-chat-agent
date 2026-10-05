import { useEffect, useRef, useState, type FormEvent } from "react";
import { sendMessage, type ChatMessage } from "./api";
import { ActivityPanel } from "./ActivityPanel";
import { Sources } from "./Sources";
import { Markdown } from "./Markdown";

// The message list + input only - no header/logout here. Used inside
// ChatAssistant's drawer or full-page wrapper, which owns its own
// header and the open/closed/maximized state.
export function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Keep the latest message in view - the list had no scroll management
  // at all before, so a reply below the fold went unnoticed.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending]);

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
        {/* Permanent first message, not part of `messages` - always
            shown, never sent to the API. */}
        <div className="message agent">
          <div className="bubble">
            Hi, I'm your HR Assistant 👋 I can help with leave balances, HR policy (leave, benefits, staff
            loan, WFH), or eligibility checks. What can I help you with today?
          </div>
        </div>
        {messages.map((m, i) => (
          <div key={i} className={`message ${m.role}`}>
            <div className="bubble">
              {m.role === "agent" ? <Markdown>{m.text}</Markdown> : m.text}
            </div>
            {m.role === "agent" && m.toolActivity && <Sources activity={m.toolActivity} />}
            {m.role === "agent" && m.toolActivity && <ActivityPanel activity={m.toolActivity} />}
          </div>
        ))}
        {sending && (
          <div className="message agent">
            <div className="bubble">
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}

      <form onSubmit={handleSend}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about leave, benefits, loans, WFH..."
          autoFocus
        />
        <button type="submit" disabled={sending}>
          Send
        </button>
      </form>
    </div>
  );
}
