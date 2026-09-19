"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { onVisibleInterval } from "@/lib/poll";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge } from "@/components/ui";

interface DocumentRow {
  id: string;
  filename: string;
  status: string;
  currentStage: string | null;
  progress: number;
  failureReason: string | null;
}

export default function ProcessingPage() {
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(opts?: { silent?: boolean }) {
    try {
      const data = await api<{ items: DocumentRow[] }>("/api/v1/documents?limit=50");
      setItems(data.items.filter((d) => !["UPLOADED"].includes(d.status)));
      setError(null);
    } catch (err) {
      if (opts?.silent) return;
      setError(err instanceof Error ? err.message : "Processing status could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  const active = items.filter((d) => !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED"].includes(d.status));

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const interval = active.length > 0 ? 5000 : 15000;
    return onVisibleInterval(() => void load({ silent: true }), interval);
  }, [active.length]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Processing</h1>
        <p className="mt-2 text-ink-500">Jobs run in the worker. You can leave this page; status is recovered from the API.</p>
      </header>
      {error ? (
        <ErrorState title="Processing status unavailable" body={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No processing history" body="Upload a document to enqueue the extraction pipeline." />
      ) : (
        <div className="space-y-3">
          {active.length === 0 ? <p className="text-sm text-ink-500">Nothing in flight.</p> : null}
          {items.map((doc) => (
            <Card key={doc.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link href={`/documents/${doc.id}`} className="font-medium hover:underline">
                  {doc.filename}
                </Link>
                <StatusBadge status={doc.status} />
              </div>
              <p className="mt-2 text-sm text-ink-500">{doc.currentStage?.replaceAll("_", " ") ?? "—"}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-paper-200">
                <div className="h-full bg-pine-600 transition-all" style={{ width: `${doc.progress}%` }} />
              </div>
              {doc.failureReason ? <p className="mt-3 text-sm text-rust-600">{doc.failureReason}</p> : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
