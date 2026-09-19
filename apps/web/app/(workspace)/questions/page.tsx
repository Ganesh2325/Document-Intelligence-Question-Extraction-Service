"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, StatusBadge } from "@/components/ui";

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

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "30", band });
    if (type) params.set("type", type);
    if (q) params.set("q", q);
    return params.toString();
  }, [band, type, q, page]);

  useEffect(() => {
    const handle = setTimeout(() => {
      api<{ items: QuestionRow[]; total: number }>(`/api/v1/questions?${query}`)
        .then((res) => {
          setItems(res.items);
          setTotal(res.total);
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Questions</h1>
        <p className="mt-2 text-ink-500">Server-side search and filters. Lists stay paginated.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        {["all", "high", "medium", "review"].map((value) => (
          <button
            key={value}
            onClick={() => {
              setBand(value);
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm ${band === value ? "bg-ink-900 text-white" : "bg-white border border-paper-200"}`}
          >
            {value === "all" ? "All" : value === "high" ? "High confidence" : value === "medium" ? "Medium" : "Needs review"}
          </button>
        ))}
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-paper-200 bg-white px-3 py-1.5 text-sm">
          <option value="">Any type</option>
          {["MCQ", "MULTI_SELECT", "TRUE_FALSE", "FILL_IN_THE_BLANK", "SHORT_ANSWER", "LONG_ANSWER", "UNKNOWN"].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search text or number" className="rounded-md border border-paper-200 px-3 py-1.5 text-sm" />
      </div>
      {items.length === 0 ? (
        <EmptyState title="No matching questions" body="Extract a document first, or widen the filters." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="grid gap-3 md:grid-cols-[auto_1fr_12rem]">
              <Link href={`/questions/${item.id}`} className="font-medium hover:underline">
                Q{item.questionNumber}
              </Link>
              <div>
                <p className="line-clamp-2 text-sm">{item.questionText}</p>
                <p className="mt-1 text-xs text-ink-500">
                  {item.questionType} · pages {item.source.pages.join(", ")} · {item.answer?.value ?? item.answer?.status ?? "unanswered"}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3">
                <StatusBadge status={item.status} />
                <ConfidenceMeter value={item.confidence.overall} />
              </div>
            </Card>
          ))}
          <div className="flex justify-between text-sm text-ink-500">
            <span>{total} results</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button onClick={() => setPage((p) => p + 1)}>Next</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
