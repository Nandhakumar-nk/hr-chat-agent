import { useState, type FormEvent } from "react";
import { login, setToken, type Employee } from "./api";
import { Logo } from "./Logo";

export function Login({ onLogin }: { onLogin: (employee: Employee) => void }) {
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, employee } = await login(employeeId, password);
      setToken(token);
      onLogin(employee);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-brand">
        <Logo size={56} />
        <h1>HR Chat Agent</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          Employee ID
          <input
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
