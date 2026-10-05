import { useState } from "react";
import { Chat } from "./Chat";
import { RobotIcon } from "./RobotIcon";

type Mode = "closed" | "drawer" | "full";

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
