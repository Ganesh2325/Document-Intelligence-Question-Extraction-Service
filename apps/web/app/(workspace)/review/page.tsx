"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, EmptyState, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/toast";

interface ReviewRow {
  id: string;
  severity: string;
  reason: string;
  confidence: number;
  status: string;
  questionId: string;
  question?: {
    questionNumber: string;
    questionText: string;
    startPage: number;
    endPage: number;
  };
}

export default function ReviewPage() {
  const { push } = useToast();
  const [tab, setTab] = useState("OPEN");
  const [items, setItems] = useState<ReviewRow[]>([]);
  const [counts, setCounts] = useState({ OPEN: 0, HIGH: 0, RESOLVED: 0 });

  async function load() {
    const [open, high, resolved] = await Promise.all([
      api<{ items: ReviewRow[]; total: number }>(`/api/v1/review-items?status=OPEN&limit=50`),
      api<{ items: ReviewRow[]; total: number }>(`/api/v1/review-items?severity=HIGH&status=OPEN&limit=50`),
      api<{ items: ReviewRow[]; total: number }>(`/api/v1/review-items?status=RESOLVED&limit=50`),
    ]);
    setCounts({ OPEN: open.total, HIGH: high.total, RESOLVED: resolved.total });
    if (tab === "HIGH") setItems(high.items);
    else if (tab === "RESOLVED") setItems(resolved.items);
    else setItems(open.items);
  }

  useEffect(() => {
    load().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function act(id: string, action: "approve" | "dismiss" | "resolve") {
    await api(`/api/v1/review-items/${id}/${action}`, { method: "POST", body: JSON.stringify({}) });
    push(`Review item ${action}d`, "success");
    await load();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Review</h1>
        <p className="mt-2 text-ink-500">Uncertainty is surfaced here instead of being hidden behind a confident UI.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {[
          ["OPEN", `Needs review (${counts.OPEN})`],
          ["HIGH", `High severity (${counts.HIGH})`],
          ["RESOLVED", `Resolved (${counts.RESOLVED})`],
        ].map(([value, label]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-full px-3 py-1.5 text-sm ${tab === value ? "bg-ink-900 text-white" : "border border-paper-200 bg-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <EmptyState title="Queue is clear" body="When extraction is uncertain, review items will land here." />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={item.severity} />
                    <StatusBadge status={item.status} />
                  </div>
                  <p className="mt-2 font-medium">
                    {item.question ? (
                      <Link className="hover:underline" href={`/questions/${item.questionId}`}>
                        Q{item.question.questionNumber}
                      </Link>
                    ) : (
                      "Question"
                    )}
                  </p>
                  <p className="mt-1 text-sm text-ink-700">{item.reason}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-ink-500">{item.question?.questionText}</p>
                  <p className="mt-2 text-xs text-ink-500">
                    Source pages {item.question?.startPage}
                    {item.question && item.question.endPage !== item.question.startPage ? `–${item.question.endPage}` : ""} · confidence {Math.round(item.confidence * 100)}%
                  </p>
                </div>
                {item.status === "OPEN" ? (
                  <div className="flex gap-2">
                    <button className="rounded-md bg-pine-700 px-3 py-1.5 text-sm text-white" onClick={() => act(item.id, "approve")}>
                      Approve
                    </button>
                    <Link className="rounded-md border border-paper-200 px-3 py-1.5 text-sm" href={`/questions/${item.questionId}`}>
                      Edit
                    </Link>
                    <button className="rounded-md border border-paper-200 px-3 py-1.5 text-sm" onClick={() => act(item.id, "resolve")}>
                      Resolve
                    </button>
                    <button className="rounded-md px-3 py-1.5 text-sm text-ink-500" onClick={() => act(item.id, "dismiss")}>
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
