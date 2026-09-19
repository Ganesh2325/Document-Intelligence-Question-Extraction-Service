"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, getApiBase, authHeaders } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, ErrorState, StatusBadge } from "@/components/ui";

interface QuestionPayload {
  question: {
    id: string;
    documentId: string;
    questionNumber: string;
    questionText: string;
    questionType: string;
    status: string;
    options: Array<{ id: string; label: string; text: string }>;
    answer: { value: string | null; status: string; sourcePages: number[] } | null;
    source: { pages: number[]; regions: Array<{ page: number; x: number; y: number; width: number; height: number }> };
    confidence: { overall: number; text: number; options: number; answer: number; sourceMapping: number };
    warnings: string[] | null;
    startPage: number;
    endPage: number;
  };
}

export default function QuestionInspectorPage() {
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<QuestionPayload | null>(null);
  const [page, setPage] = useState<number | null>(null);
  const [neighbors, setNeighbors] = useState<{ previous: { id: string } | null; next: { id: string } | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = Array.isArray(params.id) ? params.id[0] : params.id;
    if (!id) return;
    const controller = new AbortController();
    setError(null);
    setData(null);
    Promise.all([
      api<QuestionPayload>(`/api/v1/questions/${id}`, { signal: controller.signal }),
      api<{ previous: { id: string } | null; next: { id: string } | null }>(`/api/v1/questions/${id}/neighbors`, {
        signal: controller.signal,
      }),
    ])
      .then(([res, nav]) => {
        setData(res);
        setPage(res.question.startPage);
        setNeighbors(nav);
      })
      .catch((err: Error) => {
        if (err.name === "AbortError" || err.message === "Request was cancelled.") return;
        setError(err.message);
      });
    return () => controller.abort();
  }, [params.id]);

  if (error) {
    return (
      <ErrorState
        title="Question could not be opened"
        body={error}
        onRetry={() => {
          setError(null);
          setData(null);
          api<QuestionPayload>(`/api/v1/questions/${params.id}`)
            .then((res) => {
              setData(res);
              setPage(res.question.startPage);
            })
            .catch((err: Error) => setError(err.message));
        }}
      />
    );
  }

  if (!data) {
    return (
      <div className="grid gap-6 lg:grid-cols-2" aria-busy="true">
        <div className="skeleton h-80 rounded-xl" />
        <div className="skeleton h-80 rounded-xl" />
      </div>
    );
  }
  const q = data.question;
  const currentPage = page ?? q.startPage;
  const imageUrl = `${getApiBase()}/api/v1/documents/${q.documentId}/pages/${currentPage}/image`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-ink-500">Question inspector</p>
          <h1 className="font-display text-4xl">Question #{q.questionNumber}</h1>
        </div>
        <div className="flex gap-2 text-sm">
          {neighbors?.previous ? <Link className="underline" href={`/questions/${neighbors.previous.id}`}>Previous</Link> : null}
          <Link className="underline" href={`/documents/${q.documentId}`}>Document</Link>
          {neighbors?.next ? <Link className="underline" href={`/questions/${neighbors.next.id}`}>Next</Link> : null}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="min-h-[28rem]">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-medium">Source page {currentPage}</p>
            <div className="flex gap-2">
              {q.source.pages.map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`rounded px-2 py-1 text-xs ${p === currentPage ? "bg-ink-900 text-white" : "bg-paper-100"}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <PagePreview url={imageUrl} />
          <p className="mt-3 text-xs text-ink-500">
            Traceability: pages {q.source.pages.join("–")}
            {q.source.regions?.length ? ` · ${q.source.regions.length} region${q.source.regions.length === 1 ? "" : "s"} recorded` : " · page-level provenance"}
          </p>
        </Card>
        <div className="space-y-4">
          <Card>
            <div className="flex items-center justify-between">
              <StatusBadge status={q.status} />
              <span className="text-xs text-ink-500">{q.questionType}</span>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{q.questionText}</p>
            {q.options.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {q.options.map((option) => (
                  <li key={option.id} className="rounded-md bg-paper-50 px-3 py-2 text-sm">
                    <span className="font-medium">{option.label}.</span> {option.text}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-4 rounded-md border border-paper-200 px-3 py-2 text-sm">
              Answer: {q.answer?.value ?? "not assigned"}
              <span className="ml-2 text-ink-500">({q.answer?.status ?? "MISSING"})</span>
            </div>
          </Card>
          <Card>
            <p className="text-sm font-medium">Confidence</p>
            <div className="mt-3 space-y-3">
              <ConfidenceMeter value={q.confidence.overall} />
              <Signal label="Text" value={q.confidence.text} />
              <Signal label="Options" value={q.confidence.options} />
              <Signal label="Answer" value={q.confidence.answer} />
              <Signal label="Source mapping" value={q.confidence.sourceMapping} />
            </div>
          </Card>
          {q.warnings && q.warnings.length > 0 ? (
            <Card>
              <p className="text-sm font-medium">Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gold-600">
                {q.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-500">{label}</span>
      <span>{Math.round(value * 100)}%</span>
    </div>
  );
}

function PagePreview({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let objectUrl: string | null = null;
    setMissing(false);
    fetch(url, { headers: authHeaders() })
      .then((res) => {
        if (!res.ok) throw new Error("missing");
        return res.blob();
      })
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => setMissing(true));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  if (missing) return <EmptyState title="Preview unavailable" body="Source page numbers are still preserved for verification." />;
  if (!src) return <div className="skeleton h-80 w-full rounded-lg" />;
  // Authenticated blob URL — next/image cannot load these objects.
  return <img src={src} alt="Source page preview" className="max-h-[36rem] w-full rounded-lg border border-paper-200 object-contain bg-paper-50" />;
}
