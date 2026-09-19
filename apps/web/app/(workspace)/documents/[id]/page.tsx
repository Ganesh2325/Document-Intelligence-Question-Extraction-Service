"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, apiUrl, authHeaders } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, StatusBadge, formatDate, formatDuration } from "@/components/ui";
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

  const load = useCallback(async () => {
    const detail = await api<DocumentDetail>(`/api/v1/documents/${params.id}`);
    setData(detail);
    const qs = await api<{ items: QuestionRow[] }>(`/api/v1/documents/${params.id}/questions?limit=100`);
    setQuestions(qs.items);
  }, [params.id]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (!data) return;
    const active = !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED"].includes(data.document.status);
    if (!active) return;
    const timer = setInterval(() => load().catch(() => undefined), 2000);
    return () => clearInterval(timer);
  }, [data, load]);

  if (error) return <EmptyState title="Document unavailable" body={error} />;
  if (!data) return <p className="text-ink-500">Loading document…</p>;
  const doc = data.document;
  const doneStages = new Set(data.jobs.filter((j) => j.status !== "FAILED").map((j) => j.stage));

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
          <a className="rounded-md border border-paper-200 bg-white px-3 py-2 text-sm" href={`${apiUrl}/api/v1/documents/${doc.id}/questions/export`} onClick={(e) => {
            e.preventDefault();
            void fetch(`${apiUrl}/api/v1/documents/${doc.id}/questions/export`, { headers: authHeaders() })
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `${doc.filename}-questions.json`;
                a.click();
              });
          }}>
            Export JSON
          </a>
          <button
            className="rounded-md bg-pine-700 px-3 py-2 text-sm text-white"
            onClick={async () => {
              await api(`/api/v1/documents/${doc.id}/process`, { method: "POST" });
              push("Processing queued", "success");
              await load();
            }}
          >
            Reprocess
          </button>
        </div>
      </header>

      {doc.failureReason ? (
        <div className="rounded-xl border border-rust-500/30 bg-white px-4 py-3 text-sm text-rust-600">{doc.failureReason}</div>
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
          <EmptyState title="No questions yet" body="They will appear here as soon as extraction finishes." />
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
