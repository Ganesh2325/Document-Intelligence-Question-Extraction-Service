"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, ConfidenceMeter, EmptyState, ErrorState, Skeleton, StatusBadge, formatDate } from "@/components/ui";

interface Stats {
  documentsProcessed: number;
  questionsExtracted: number;
  reviewRequired: number;
  averageConfidence: number | null;
  processingSuccessRate: number | null;
  processingDocuments: number;
  failedDocuments: number;
  averageProcessingTimeMs: number | null;
  recentDocuments: Array<{ id: string; filename: string; status: string; createdAt: string; questionCount: number }>;
  activeJobs: Array<{ id: string; documentId: string; filename: string; stage: string; status: string; progress: number }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Stats>("/api/v1/dashboard/stats")
      .then(setStats)
      .catch((err) => setError(err.message));
  }, []);

  if (error) {
    return (
      <ErrorState
        title="Dashboard unavailable"
        body={error}
        onRetry={() => {
          setError(null);
          setStats(null);
          api<Stats>("/api/v1/dashboard/stats")
            .then(setStats)
            .catch((err) => setError(err.message));
        }}
      />
    );
  }

  if (!stats) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }

  const tiles = [
    { label: "Documents", value: stats.documentsProcessed.toLocaleString() },
    { label: "Questions extracted", value: stats.questionsExtracted.toLocaleString() },
    { label: "Review required", value: stats.reviewRequired.toLocaleString() },
    {
      label: "Average confidence",
      value: stats.averageConfidence === null ? "—" : `${(stats.averageConfidence * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-ink-500">Workspace</p>
        <h1 className="mt-1 font-display text-4xl">Document intelligence</h1>
        <p className="mt-2 max-w-2xl text-ink-500">
          Live extraction metrics from your own documents — never placeholder numbers.
        </p>
      </header>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((tile) => (
          <Card key={tile.label}>
            <p className="text-sm text-ink-500">{tile.label}</p>
            <p className="mt-3 font-display text-4xl">{tile.value}</p>
          </Card>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <p className="text-sm text-ink-500">Processing success rate</p>
          <p className="mt-3 font-display text-3xl">
            {stats.processingSuccessRate === null ? "—" : `${Math.round(stats.processingSuccessRate * 100)}%`}
          </p>
          <p className="mt-2 text-xs text-ink-500">{stats.failedDocuments} failed · {stats.processingDocuments} in flight</p>
        </Card>
        <Card className="lg:col-span-2">
          <p className="text-sm font-medium">Active processing</p>
          {stats.activeJobs.length === 0 ? (
            <p className="mt-4 text-sm text-ink-500">No jobs running. Upload a paper to start the pipeline.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {stats.activeJobs.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-4 text-sm">
                  <Link href={`/documents/${job.documentId}`} className="truncate underline-offset-2 hover:underline">
                    {job.filename}
                  </Link>
                  <span className="text-ink-500">{job.stage.replaceAll("_", " ")} · {job.progress}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl">Recent documents</h2>
          <Link href="/documents" className="text-sm text-pine-700 underline">
            Open library
          </Link>
        </div>
        {stats.recentDocuments.length === 0 ? (
          <EmptyState title="Nothing processed yet" body="Upload a PDF or image to extract questions with source traceability." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-paper-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-50 text-ink-500">
                <tr>
                  <th className="px-4 py-3 font-medium">File</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Questions</th>
                  <th className="px-4 py-3 font-medium">Uploaded</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentDocuments.map((doc) => (
                  <tr key={doc.id} className="border-t border-paper-200">
                    <td className="px-4 py-3">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.filename}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3">{doc.questionCount}</td>
                    <td className="px-4 py-3 text-ink-500">{formatDate(doc.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <ConfidenceMeter value={stats.averageConfidence} />
    </div>
  );
}
