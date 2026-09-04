import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { post } from "../api.js";
import { useAuth } from "../auth/AuthContext.js";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createGame() {
    setBusy(true);
    setError(null);
    try {
      const { joinCode: code } = await post<{ joinCode: string; id: string }>("/sessions");
      navigate(`/g/${code}`);
    } catch {
      setError("Couldn't create a game. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function joinGame(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const code = joinCode.trim().toUpperCase();
      await post(`/sessions/${code}/join`, {});
      navigate(`/g/${code}`);
    } catch {
      setError("Couldn't join — check the code and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">VGDE</h1>
        <button
          className="rounded-lg border border-border-strong px-3 py-1.5 text-sm text-muted hover:bg-surface-alt hover:text-text"
          onClick={() => void logout()}
        >
          Sign out ({user?.displayNameDefault})
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-3 font-semibold">Host a new game</h2>
        <button
          onClick={() => void createGame()}
          disabled={busy}
          className="w-full rounded-lg bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Create game
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6">
        <h2 className="mb-3 font-semibold">Join a game</h2>
        <form onSubmit={joinGame} className="flex gap-2">
          <input
            className="flex-1 rounded-lg border border-border-strong bg-input px-3 py-2 uppercase tracking-widest"
            placeholder="CODE"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            maxLength={8}
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-surface-alt-hover px-4 py-2 font-medium text-text hover:bg-surface-strong disabled:opacity-50"
          >
            Join
          </button>
        </form>
      </div>

      {error && <p className="text-center text-sm text-danger">{error}</p>}

      <Link to="/question-bank" className="text-center text-sm text-link underline hover:text-accent-hover">
        Browse the question bank
      </Link>
    </div>
  );
}
