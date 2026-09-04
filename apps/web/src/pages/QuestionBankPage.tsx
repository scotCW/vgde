import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { get } from "../api.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import type { PaginatedQuestions } from "../types.js";

const PAGE_SIZE = 50;

export default function QuestionBankPage() {
  const [search, setSearch] = useState("");
  const [activeTags, setActiveTags] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);

  const debouncedSearch = useDebouncedValue(search, 300);

  // A new search or filter invalidates whatever page we were on.
  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch, activeTags]);

  const tagsQuery = useQuery({
    queryKey: ["question-tags"],
    queryFn: () => get<{ tags: string[] }>("/questions/tags"),
    staleTime: Infinity,
  });

  const questionsQuery = useQuery({
    queryKey: ["questions-page", debouncedSearch, [...activeTags].sort().join(","), offset],
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (activeTags.size > 0) params.set("tags", [...activeTags].join(","));
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(offset));
      return get<PaginatedQuestions>(`/questions?${params.toString()}`);
    },
    placeholderData: (prev) => prev,
  });

  function toggleTag(tag: string) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  const total = questionsQuery.data?.total ?? 0;
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + PAGE_SIZE, total);
  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Question bank</h1>
          <p className="text-sm text-muted">Browse every prompt before you play.</p>
        </div>
        <Link to="/" className="text-sm text-link underline hover:text-accent-hover">
          Back home
        </Link>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search question text…"
          className="rounded-lg border border-border-strong bg-input px-3 py-2"
        />

        {tagsQuery.data && tagsQuery.data.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tagsQuery.data.tags.map((tag) => {
              const active = activeTags.has(tag);
              return (
                <button
                  key={tag}
                  onClick={() => toggleTag(tag)}
                  className={`rounded-full border px-3 py-1 text-sm capitalize transition ${
                    active
                      ? "border-indigo-400 bg-indigo-600 text-white"
                      : "border-border-strong bg-surface-alt text-text hover:bg-surface-alt-hover"
                  }`}
                >
                  {tag}
                </button>
              );
            })}
            {activeTags.size > 0 && (
              <button
                onClick={() => setActiveTags(new Set())}
                className="rounded-full border border-border-strong px-3 py-1 text-sm text-muted hover:bg-surface-alt"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>

      {questionsQuery.isLoading && <p className="text-muted">Loading…</p>}
      {questionsQuery.isError && <p className="text-danger">Couldn't load the question bank.</p>}

      {questionsQuery.data && (
        <p className="text-sm text-muted">
          {total === 0 ? "No questions match" : `Showing ${pageStart}–${pageEnd} of ${total} questions`}
          {activeTags.size > 0 && ` — matching any of: ${[...activeTags].join(", ")}`}
        </p>
      )}

      <div className={`flex flex-col gap-2 transition-opacity ${questionsQuery.isFetching ? "opacity-60" : ""}`}>
        {questionsQuery.data?.items.map((q) => (
          <div key={q.id} className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="mb-1">{q.text}</p>
            {q.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {q.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-surface-alt px-2 py-0.5 text-xs capitalize text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            disabled={!hasPrev || questionsQuery.isFetching}
            className="rounded-lg bg-surface-alt px-4 py-2 text-sm font-medium hover:bg-surface-alt-hover disabled:opacity-40"
          >
            ← Previous
          </button>
          <span className="text-sm text-muted">
            Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            disabled={!hasNext || questionsQuery.isFetching}
            className="rounded-lg bg-surface-alt px-4 py-2 text-sm font-medium hover:bg-surface-alt-hover disabled:opacity-40"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
