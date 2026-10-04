/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL of the backend API. Unset -> relative URLs (/api/...),
  // which only work when the frontend is served from the same origin
  // as the backend (the dev proxy, or server.js serving client/dist).
  // Set at build time to point a separately-deployed frontend at a
  // backend running anywhere else.
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
