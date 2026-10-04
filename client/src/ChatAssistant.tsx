import { useState } from "react";
import { Chat } from "./Chat";

type Mode = "closed" | "drawer" | "full";

// A small robot/AI-assistant glyph for the FAB - a friendlier, more
// "agent" feel than a generic chat-bubble emoji. Same inline-SVG
// approach as Logo.tsx.
function RobotIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="2" r="1.4" fill="white" />
      <rect x="4" y="5" width="16" height="13" rx="4" stroke="white" strokeWidth="1.8" />
      <circle cx="9" cy="11.5" r="1.6" fill="white" />
      <circle cx="15" cy="11.5" r="1.6" fill="white" />
      <path d="M9 15c.8.7 1.9 1 3 1s2.2-.3 3-1" stroke="white" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="2" y1="10" x2="4" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="10" x2="22" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// The floating HR agent: closed (just a FAB) -> drawer (right-hand
// panel) -> full (covers the viewport) -> back to drawer or closed.
// Chat.tsx itself doesn't know which mode it's in - only this wrapper's
// size/position changes.
export function ChatAssistant() {
  const [mode, setMode] = useState<Mode>("closed");

  if (mode === "closed") {
    return (
      <div className="chat-fab-wrapper">
        <span className="chat-fab-label">Need help? Ask me!</span>
        <div className="chat-fab-rings">
          <span className="chat-fab-ring" />
          <span className="chat-fab-ring delay" />
          <button className="chat-fab" onClick={() => setMode("drawer")} aria-label="Open HR Agent Assistant">
            <RobotIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      {mode === "full" && <div className="chat-assistant-backdrop" onClick={() => setMode("drawer")} />}
      <div className={`chat-assistant ${mode === "full" ? "full" : "drawer"}`}>
        <div className="chat-assistant-header">
          <span>HR Agent Assistant</span>
          <div className="chat-assistant-controls">
            {mode === "drawer" ? (
              <button onClick={() => setMode("full")} aria-label="Maximize" title="Maximize">
                ⤢
              </button>
            ) : (
              <button onClick={() => setMode("drawer")} aria-label="Restore" title="Restore">
                ⤡
              </button>
            )}
            <button onClick={() => setMode("closed")} aria-label="Close" title="Close">
              ✕
            </button>
          </div>
        </div>
        <Chat />
      </div>
    </>
  );
}
