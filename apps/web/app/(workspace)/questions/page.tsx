"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui";

interface QuestionRow {
  id: string;
  documentId: string;
  documentFilename?: string;
  questionNumber: string;
  questionText: string;
  questionType: string;
  status: string;
  confidence: { overall: number };
  answer: { value: string | null; status: string } | null;
  source: { pages: number[] };
}

export default function QuestionsPage() {
  const [band, setBand] = useState("all");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<QuestionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 30;

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit), band });
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    return params.toString();
  }, [band, type, q, page]);

  const load = useCallback(() => {
    if (items.length === 0) setLoading(true);
    setError(null);
    return api<{ items: QuestionRow[]; total: number }>(`/api/v1/questions?${query}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [query, items.length]);

  useEffect(() => {
    const handle = setTimeout(() => {
      void load();
    }, 250);
    return () => clearTimeout(handle);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Questions</h1>
        <p className="mt-2 text-ink-500">Server-side search and filters. Lists stay paginated.</p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        {["all", "high", "medium", "review"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setBand(value);
              setPage(1);
            }}
            aria-pressed={band === value}
            className={`h-9 rounded-full px-3 text-sm ${band === value ? "bg-ink-900 text-white" : "bg-white border border-paper-200"}`}
          >
            {value === "all" ? "All" : value === "high" ? "High confidence" : value === "medium" ? "Medium" : "Needs review"}
          </button>
        ))}
        <label className="sr-only" htmlFor="question-type">
          Question type
        </label>
        <select
          id="question-type"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-md border border-paper-200 bg-white px-3 text-sm"
        >
          <option value="">Any type</option>
          {["MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_IN_THE_BLANK", "SHORT_ANSWER", "LONG_ANSWER", "UNKNOWN"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label className="sr-only" htmlFor="question-search">
          Search questions
        </label>
        <input
          id="question-search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          placeholder="Search text or number"
          className="h-9 min-w-[12rem] flex-1 rounded-md border border-paper-200 bg-white px-3 text-sm sm:max-w-xs sm:flex-none sm:ml-auto"
        />
      </div>
      {error ? (
        <ErrorState title="Questions could not be loaded" body={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No matching questions" body="Extract a document first, or widen the filters." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card
              key={item.id}
              className="grid grid-cols-1 items-start gap-x-6 gap-y-3 sm:grid-cols-[4.5rem_minmax(0,1fr)] lg:grid-cols-[4.5rem_minmax(0,1fr)_9.25rem_11rem] lg:items-center"
            >
              <Link
                href={`/questions/${item.id}`}
                className="w-14 shrink-0 font-medium tabular-nums hover:underline"
              >
                Q{item.questionNumber}
              </Link>
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm leading-6">{item.questionText}</p>
                <p className="mt-1 truncate text-xs text-ink-500">
                  {item.documentFilename ? `${item.documentFilename} · ` : ""}
                  {item.questionType.replaceAll("_", " ")} · pages {item.source.pages.join(", ")} · {item.answer?.value ?? item.answer?.status ?? "unanswered"}
                </p>
              </div>
              <div className="lg:justify-self-end">
                <StatusBadge status={item.status} />
              </div>
              <div className="w-full max-w-[11rem] lg:justify-self-end">
                <ConfidenceMeter value={item.confidence.overall} />
              </div>
            </Card>
          ))}
          <div className="flex justify-between text-sm text-ink-500">
            <span>
              {total} results · page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
