import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { del, get, patch, post } from "../api.js";
import type { CustomCardDto, CustomCardExportBundle, CustomCardImportResult } from "../types.js";

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

interface CardFormProps {
  initialText?: string;
  initialTags?: string[];
  submitLabel: string;
  onSubmit: (text: string, tags: string[]) => Promise<void>;
  onCancel?: () => void;
}

function CardForm({ initialText = "", initialTags = [], submitLabel, onSubmit, onCancel }: CardFormProps) {
  const [text, setText] = useState(initialText);
  const [tagsInput, setTagsInput] = useState(initialTags.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim(), parseTags(tagsInput));
      setText("");
      setTagsInput("");
    } catch {
      setError("Couldn't save that card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Question text…"
        rows={2}
        maxLength={500}
        className="rounded-lg border border-border-strong bg-input px-3 py-2"
      />
      <input
        value={tagsInput}
        onChange={(e) => setTagsInput(e.target.value)}
        placeholder="Tags, comma separated (optional)"
        className="rounded-lg border border-border-strong bg-input px-3 py-2"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border-strong px-3 py-2 text-sm hover:bg-surface-alt"
          >
            Cancel
          </button>
        )}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </form>
  );
}

function ImportExportPanel({ onImported }: { onImported: () => Promise<unknown> }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function exportCards() {
    setBusy(true);
    setError(null);
    try {
      const bundle = await get<CustomCardExportBundle>("/questions/custom/export");
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vgde-custom-cards.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Couldn't export your cards.");
    } finally {
      setBusy(false);
    }
  }

  async function importFile(file: File) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const raw = await file.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("That file isn't valid JSON.");
      }
      const cards = (parsed as CustomCardExportBundle | null)?.cards;
      if (!Array.isArray(cards)) throw new Error("That doesn't look like a custom-cards export file.");

      const result = await post<CustomCardImportResult>("/questions/custom/import", { cards });
      setMessage(
        result.skipped > 0
          ? `Added ${result.imported} card${result.imported === 1 ? "" : "s"}, skipped ${result.skipped} you already had.`
          : `Added ${result.imported} card${result.imported === 1 ? "" : "s"}.`,
      );
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that file.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
      <button
        onClick={() => void exportCards()}
        disabled={busy}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-alt disabled:opacity-50"
      >
        Export my cards
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={busy}
        className="rounded-lg border border-border-strong px-3 py-1.5 text-sm hover:bg-surface-alt disabled:opacity-50"
      >
        Import from file
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
        }}
      />
      <span className="text-sm text-muted">Share a deck with someone else — no shared host needed.</span>
      {message && <p className="w-full text-sm text-link">{message}</p>}
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}

export default function MyCardsPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const cardsQuery = useQuery({
    queryKey: ["my-custom-cards"],
    queryFn: () => get<CustomCardDto[]>("/questions/custom"),
  });

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ["my-custom-cards"] });
  }

  async function createCard(text: string, tags: string[]) {
    await post("/questions/custom", { text, tags });
    await invalidate();
  }

  async function saveEdit(id: string, text: string, tags: string[]) {
    await patch(`/questions/custom/${id}`, { text, tags });
    setEditingId(null);
    await invalidate();
  }

  async function deleteCard(id: string) {
    await del(`/questions/custom/${id}`);
    await invalidate();
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">My custom cards</h1>
          <p className="text-sm text-muted">
            Private to you — only games you host can draw them, and no one else ever sees them.
          </p>
        </div>
        <Link to="/" className="text-sm text-link underline hover:text-accent-hover">
          Back home
        </Link>
      </header>

      <ImportExportPanel onImported={invalidate} />

      <div className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 font-semibold">Add a card</h2>
        <CardForm submitLabel="Add card" onSubmit={createCard} />
      </div>

      {cardsQuery.isLoading && <p className="text-muted">Loading…</p>}
      {cardsQuery.isError && <p className="text-danger">Couldn't load your cards.</p>}
      {cardsQuery.data && cardsQuery.data.length === 0 && (
        <p className="text-muted">You haven't added any custom cards yet.</p>
      )}

      <div className="flex flex-col gap-2">
        {cardsQuery.data?.map((card) =>
          editingId === card.id ? (
            <div key={card.id} className="rounded-xl border border-border bg-surface p-4">
              <CardForm
                initialText={card.text}
                initialTags={card.tags}
                submitLabel="Save"
                onSubmit={(text, tags) => saveEdit(card.id, text, tags)}
                onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <div key={card.id} className="rounded-xl border border-border bg-surface px-4 py-3">
              <p className="mb-1">{card.text}</p>
              {card.tags.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-surface-alt px-2 py-0.5 text-xs capitalize text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-3 text-sm">
                <button onClick={() => setEditingId(card.id)} className="text-link underline hover:text-accent-hover">
                  Edit
                </button>
                <button onClick={() => void deleteCard(card.id)} className="text-danger underline hover:opacity-80">
                  Delete
                </button>
              </div>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
