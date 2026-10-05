// Dark-by-default theme, switchable to light, persisted in localStorage.
// The actual no-flash-on-load handling lives in index.html's inline
// script (runs before any CSS/JS, so a stored "light" preference is
// applied before first paint) - this module is what the running React
// app uses to read/change it afterward.

export type Theme = "dark" | "light";

const STORAGE_KEY = "hr-chat-theme";

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing / blocked storage - theme still applies for this load.
  }
}
