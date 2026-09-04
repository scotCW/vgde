import { useState } from "react";
import { useAuth } from "../auth/AuthContext.js";
import { ApiError } from "../api.js";

export default function LoginPage() {
  const { login, register, oidcEnabled, passwordLoginEnabled } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(friendlyError(err.code));
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-8 shadow-xl">
        <h1 className="mb-1 text-2xl font-bold">VGDE</h1>
        <p className="mb-6 text-sm text-muted">
          {passwordLoginEnabled
            ? mode === "login"
              ? "Sign in to join or host a game."
              : "Create an account to get started."
            : "Sign in with single sign-on to join or host a game."}
        </p>

        {passwordLoginEnabled && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            {mode === "register" && (
              <input
                className="rounded-lg border border-border-strong bg-input px-3 py-2"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                maxLength={40}
              />
            )}
            <input
              className="rounded-lg border border-border-strong bg-input px-3 py-2"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-border-strong bg-input px-3 py-2"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === "register" ? 10 : undefined}
            />
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
            >
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>
        )}

        {oidcEnabled && (
          <a
            href="/auth/oidc/start"
            className={`block rounded-lg border border-border-strong px-3 py-2 text-center hover:bg-surface-alt ${
              passwordLoginEnabled ? "mt-3" : ""
            }`}
          >
            Continue with single sign-on
          </a>
        )}

        {passwordLoginEnabled && (
          <button
            className="mt-4 text-sm text-muted hover:text-text"
            onClick={() => setMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
          </button>
        )}
      </div>
    </div>
  );
}

function friendlyError(code: string): string {
  switch (code) {
    case "INVALID_CREDENTIALS":
      return "Incorrect email or password.";
    case "EMAIL_IN_USE":
      return "That email is already registered.";
    case "INVALID_INPUT":
      return "Please check the form (password needs 10+ characters).";
    default:
      return "Something went wrong.";
  }
}
