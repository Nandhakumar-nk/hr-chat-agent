import { useEffect, useState } from "react";
import { Login } from "./Login";
import { Chat } from "./Chat";
import { me, getToken, clearToken, type Employee } from "./api";
import "./App.css";

export default function App() {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [checking, setChecking] = useState(true);

  // On load, if a token is already stored (a page refresh mid-session),
  // re-hydrate who's logged in via /api/me rather than silently trusting
  // the stored token's own claims.
  useEffect(() => {
    if (!getToken()) {
      setChecking(false);
      return;
    }
    me()
      .then(setEmployee)
      .catch(() => clearToken())
      .finally(() => setChecking(false));
  }, []);

  function handleLogout() {
    clearToken();
    setEmployee(null);
  }

  if (checking) {
    return null;
  }

  return employee ? (
    <Chat employee={employee} onLogout={handleLogout} />
  ) : (
    <Login onLogin={setEmployee} />
  );
}
