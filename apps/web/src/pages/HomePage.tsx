import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError, get, post } from "../api.js";
import { useAuth } from "../auth/AuthContext.js";
import type { MyGameDto } from "../types.js";

const STATUS_LABEL: Record<MyGameDto["status"], string> = {
  LOBBY: "Lobby",
  VOTING: "In progress",
  COMPLETED: "Completed",
};

const STATUS_CLASS: Record<MyGameDto["status"], string> = {
  LOBBY: "bg-surface-alt text-muted",
  VOTING: "bg-panel-accent text-link",
  COMPLETED: "bg-emerald-700 text-white",
};

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout, deleteAccount } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function exportMyData() {
    setExportBusy(true);
    setExportError(null);
    try {
      const bundle = await get("/me/export");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vgde-my-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Couldn't export your data. Try again.");
    } finally {
      setExportBusy(false);
    }
  }

  const myGamesQuery = useQuery({
    queryKey: ["my-games"],
    queryFn: () => get<MyGameDto[]>("/sessions/mine"),
    // Games in progress can change while you're looking at something else
    // (this list, an in-progress game elsewhere) — keep it reasonably
    // fresh without a websocket just for the home page.
    refetchInterval: 15000,
  });

  async function confirmDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteAccount();
    } catch (err) {
      setDeleteError(
        err instanceof ApiError && err.code === "ACTIVE_GAME"
          ? err.message
          : "Couldn't delete your account. Try again.",
      );
      setDeleteBusy(false);
    }
  }

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

      {myGamesQuery.data && myGamesQuery.data.length > 0 && (
        <div className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-3 font-semibold">My games</h2>
          <div className="flex flex-col gap-2">
            {myGamesQuery.data.map((g) => (
              <Link
                key={g.joinCode}
                to={`/g/${g.joinCode}`}
                className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2 text-sm hover:bg-surface-alt-hover"
              >
                <span className="flex items-center gap-2">
                  <span className="font-mono font-semibold tracking-widest">{g.joinCode}</span>
                  {g.isHost && <span className="text-xs text-subtle">(host)</span>}
                  <span className="text-xs text-subtle">{g.playerCount} players</span>
                </span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLASS[g.status]}`}>
                  {STATUS_LABEL[g.status]}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-1 text-sm">
        <Link to="/question-bank" className="text-link underline hover:text-accent-hover">
          Browse the question bank
        </Link>
        <Link to="/my-cards" className="text-link underline hover:text-accent-hover">
          My custom cards
        </Link>
      </div>

      <div className="flex flex-col items-center gap-2 border-t border-border pt-4">
        <button
          onClick={() => void exportMyData()}
          disabled={exportBusy}
          className="text-sm text-subtle hover:text-text disabled:opacity-50"
        >
          Export my data
        </button>
        {exportError && <p className="text-sm text-danger">{exportError}</p>}

        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="mx-auto block text-sm text-subtle hover:text-danger"
          >
            Delete my account
          </button>
        ) : (
          <div className="rounded-2xl border border-danger-chip-border bg-danger-chip p-4 text-center">
            <p className="mb-3 text-sm text-danger">
              This permanently deletes your account and everything tied to it — no undo.
            </p>
            <div className="flex justify-center gap-2">
              <button
                onClick={() => void confirmDeleteAccount()}
                disabled={deleteBusy}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Yes, delete it
              </button>
              <button
                onClick={() => {
                  setConfirmingDelete(false);
                  setDeleteError(null);
                }}
                disabled={deleteBusy}
                className="rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-alt"
              >
                Cancel
              </button>
            </div>
            {deleteError && <p className="mt-3 text-sm text-danger">{deleteError}</p>}
          </div>
        )}
      </div>

      <a
        href="https://github.com/scotCW/vgde"
        target="_blank"
        rel="noreferrer"
        className="text-center text-xs text-subtle hover:text-muted"
      >
        View on GitHub
      </a>
    </div>
  );
}
