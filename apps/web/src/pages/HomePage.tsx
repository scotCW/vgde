import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, post } from "../api.js";
import { useAuth } from "../auth/AuthContext.js";

export default function HomePage() {
  const navigate = useNavigate();
  const { user, logout, deleteAccount } = useAuth();
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      <div className="flex flex-col items-center gap-1 text-sm">
        <Link to="/question-bank" className="text-link underline hover:text-accent-hover">
          Browse the question bank
        </Link>
        <Link to="/my-cards" className="text-link underline hover:text-accent-hover">
          My custom cards
        </Link>
      </div>

      <div className="border-t border-border pt-4">
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
    </div>
  );
}
