"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ApiError, api, authHeaders } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, ErrorState, Skeleton, StatusBadge, formatDate, formatDuration } from "@/components/ui";
import { useToast } from "@/components/toast";

interface DocumentDetail {
  document: {
    id: string;
    filename: string;
    status: string;
    currentStage: string | null;
    progress: number;
    pageCount: number | null;
    createdAt: string;
    processingDurationMs: number | null;
    averageConfidence: number | null;
    highConfidenceCount: number;
    reviewCount: number;
    questionCount: number;
    failureReason: string | null;
  };
  jobs: Array<{ id: string; stage: string; status: string; durationMs: number | null }>;
}

interface QuestionRow {
  id: string;
  questionNumber: string;
  questionText: string;
  questionType: string;
  status: string;
  confidence: { overall: number };
  answer: { value: string | null; status: string } | null;
  source: { pages: number[] };
  reviewState: string;
}

const TIMELINE = [
  { stage: "upload", label: "Upload" },
  { stage: "validation", label: "Validation" },
  { stage: "ocr", label: "OCR" },
  { stage: "structure", label: "Structure" },
  { stage: "questions", label: "Questions" },
  { stage: "answers", label: "Answers" },
  { stage: "validation_results", label: "Validation" },
];

export default function DocumentDetailPage() {
  const params = useParams<{ id: string }>();
  const { push } = useToast();
  const [data, setData] = useState<DocumentDetail | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean; signal?: AbortSignal }) => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;
    try {
      const detail = await api<DocumentDetail>(`/api/v1/documents/${id}`, { signal: opts?.signal });
      if (opts?.signal?.aborted) return;
      setData(detail);
      setError(null);
      try {
        const qs = await api<{ items: QuestionRow[] }>(`/api/v1/documents/${id}/questions?limit=50`, {
          signal: opts?.signal,
        });
        if (opts?.signal?.aborted) return;
        setQuestions(qs.items);
      } catch (questionsErr) {
        if (questionsErr instanceof ApiError && questionsErr.code === "REQUEST_ABORTED") return;
        setQuestions([]);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === "REQUEST_ABORTED") return;
      if (opts?.silent) return;
      setError(err instanceof Error ? err.message : "The document could not be loaded.");
    }
  }, [params.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load({ signal: controller.signal });
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const active = !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED"].includes(data.document.status);
    if (!active) return;
    const timer = setInterval(() => void load({ silent: true }), 2000);
    return () => clearInterval(timer);
  }, [data, load]);

  if (error) return <ErrorState title="Document unavailable" body={error} onRetry={() => void load()} />;
  if (!data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-16 w-80" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  const doc = data.document;
  const doneStages = new Set(data.jobs.filter((j) => j.status !== "FAILED").map((j) => j.stage));
  const processing = !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED", "UPLOADED"].includes(doc.status);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500">Document</p>
          <h1 className="font-display text-4xl">{doc.filename}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <StatusBadge status={doc.status} />
            <span className="text-sm text-ink-500">{doc.pageCount ?? "—"} pages</span>
            <span className="text-sm text-ink-500">{formatDate(doc.createdAt)}</span>
            <span className="text-sm text-ink-500">{formatDuration(doc.processingDurationMs)}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <a className="rounded-md border border-paper-200 bg-white px-3 py-2 text-sm" href={`/api/v1/documents/${doc.id}/questions/export`} onClick={(e) => {
            e.preventDefault();
            void fetch(`/api/v1/documents/${doc.id}/questions/export`, { headers: authHeaders() })
              .then((r) => {
                if (!r.ok) throw new Error("Export failed.");
                return r.blob();
              })
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${doc.filename}-questions.json`;
                a.click();
              })
              .catch((err: Error) => {
                const message = /failed to fetch|load failed|networkerror/i.test(err.message)
                  ? "The API could not be reached. Confirm the Folio API is running, then retry."
                  : err.message;
                push(message, "error");
              });
          }}>
            Export JSON
          </a>
          <button
            className="rounded-md bg-pine-700 px-3 py-2 text-sm text-white"
            onClick={async () => {
              try {
                await api(`/api/v1/documents/${doc.id}/process`, { method: "POST" });
                push("Processing queued", "success");
                await load();
              } catch (err) {
                push(err instanceof Error ? err.message : "Could not queue processing.", "error");
              }
            }}
          >
            Reprocess
          </button>
          {processing ? (
            <button
              className="rounded-md border border-paper-200 bg-white px-3 py-2 text-sm"
              onClick={async () => {
                try {
                  await api(`/api/v1/documents/${doc.id}/cancel`, { method: "POST" });
                  push("Processing cancelled. Safe results already stored are kept.", "success");
                  await load();
                } catch (err) {
                  push(err instanceof Error ? err.message : "Could not cancel processing.", "error");
                }
              }}
            >
              Cancel
            </button>
          ) : null}
        </div>
      </header>

      {doc.failureReason ? (
        <div className="rounded-xl border border-rust-500/30 bg-white px-4 py-3 text-sm">
          <p className="font-medium text-rust-600">Processing failed</p>
          <p className="mt-1 text-ink-700">{doc.failureReason}</p>
          <p className="mt-2 text-ink-500">
            Other documents were not affected. You can reprocess this file or upload a clearer scan.
          </p>
        </div>
      ) : null}

      <Card>
        <h2 className="font-display text-2xl">Processing timeline</h2>
        <ol className="mt-5 grid gap-3 md:grid-cols-7">
          {TIMELINE.map((step) => {
            const complete = doneStages.has(step.stage) || doc.progress >= 100;
            const current = doc.currentStage === step.stage;
            return (
              <li key={step.stage} className="rounded-lg border border-paper-200 p-3">
                <p className="text-xs text-ink-500">{complete ? "Done" : current ? "In progress" : "Pending"}</p>
                <p className="mt-1 text-sm font-medium">{step.label} {complete ? "✓" : current ? "…" : ""}</p>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-200">
          <div className="h-full bg-pine-600 transition-all" style={{ width: `${doc.progress}%` }} />
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-sm text-ink-500">Questions</p>
          <p className="mt-2 font-display text-4xl">{doc.questionCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-500">High confidence</p>
          <p className="mt-2 font-display text-4xl">{doc.highConfidenceCount}</p>
        </Card>
        <Card>
          <p className="text-sm text-ink-500">Review</p>
          <p className="mt-2 font-display text-4xl">{doc.reviewCount}</p>
        </Card>
      </section>
      <ConfidenceMeter value={doc.averageConfidence} />

      <section>
        <h2 className="mb-3 font-display text-2xl">Questions</h2>
        {questions.length === 0 ? (
          <EmptyState
            title={processing ? "Extraction in progress" : "No questions yet"}
            body={processing ? "Questions appear here as soon as this version finishes." : "They will appear here as soon as extraction finishes."}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-paper-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-50 text-ink-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Text</th>
                  <th className="px-4 py-3">Answer</th>
                  <th className="px-4 py-3">Pages</th>
                  <th className="px-4 py-3">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {questions.map((q) => (
                  <tr key={q.id} className="border-t border-paper-200">
                    <td className="px-4 py-3">
                      <Link className="font-medium hover:underline" href={`/questions/${q.id}`}>
                        Q{q.questionNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{q.questionType}</td>
                    <td className="max-w-md truncate px-4 py-3">{q.questionText}</td>
                    <td className="px-4 py-3">{q.answer?.value ?? q.answer?.status ?? "—"}</td>
                    <td className="px-4 py-3">{q.source.pages.join(", ")}</td>
                    <td className="px-4 py-3">
                      <ConfidenceMeter value={q.confidence.overall} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
