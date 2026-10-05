// Shared small robot/AI-assistant glyph - used on the chat FAB
// (ChatAssistant.tsx) and the Ask button (Chat.tsx), so both read as
// the same "agent" visual identity rather than two different icons.

export function RobotIcon({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="2" r="1.4" fill="currentColor" />
      <rect x="4" y="5" width="16" height="13" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="9" cy="11.5" r="1.6" fill="currentColor" />
      <circle cx="15" cy="11.5" r="1.6" fill="currentColor" />
      <path
        d="M9 15c.8.7 1.9 1 3 1s2.2-.3 3-1"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <line x1="2" y1="10" x2="4" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="20" y1="10" x2="22" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
