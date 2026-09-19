"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, getApiBase, authHeaders } from "@/lib/api";
import { onVisibleInterval } from "@/lib/poll";
import { Card, EmptyState, ErrorState, Skeleton, StatusBadge, formatDate } from "@/components/ui";
import { useToast } from "@/components/toast";

interface DocumentRow {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  progress: number;
  questionCount: number;
  reviewCount: number;
  createdAt: string;
}

interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
}

export default function DocumentsPage() {
  const { push } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<DocumentRow[]>([]);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setError(null);
      const data = await api<Paginated<DocumentRow>>(`/api/v1/documents?limit=50&q=${encodeURIComponent(q)}`);
      setItems(data.items);
      if (!opts?.silent) setError(null);
    } catch (err) {
      if (opts?.silent) return;
      const message = err instanceof Error ? err.message : "Documents could not be loaded.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    const handle = setTimeout(() => void load(), 250);
    return () => clearTimeout(handle);
  }, [load]);

  useEffect(() => {
    const active = items.some((d) => !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED"].includes(d.status));
    if (!active) return;
    return onVisibleInterval(() => void load({ silent: true }), 8000);
  }, [items, load]);

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        const created = await fetch(`${getApiBase()}/api/v1/documents`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
        }).catch(() => {
          throw new Error("The API could not be reached. Confirm the Folio API is running, then retry.");
        });
        const json = await created.json();
        if (!created.ok) throw new Error(json.error?.message ?? "Upload failed.");
        await api(`/api/v1/documents/${json.document.id}/process`, { method: "POST" });
        push(`${file.name} queued for processing`, "success");
        await load();
      } catch (error) {
        push(error instanceof Error ? error.message : "Upload failed.", "error");
      }
    }
    setUploading(null);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Documents</h1>
          <p className="mt-2 text-ink-500">PDF, JPG, and PNG. Processing starts as soon as the file is stored.</p>
        </div>
        <input
          id="document-search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search filenames"
          aria-label="Search filenames"
          className="w-64 rounded-md border border-paper-200 bg-white px-3 py-2 text-sm"
        />
      </header>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) void uploadFiles(e.dataTransfer.files);
        }}
        className={`rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
          drag ? "border-pine-600 bg-white" : "border-paper-200 bg-paper-50"
        }`}
      >
        <p className="font-display text-2xl">Drop examination papers here</p>
        <p className="mt-2 text-sm text-ink-500">or choose files from disk. Max 25 MB. PDF / JPG / PNG only.</p>
        <p className="sr-only" aria-live="polite">
          {uploading ? `Uploading ${uploading}` : ""}
        </p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-5 rounded-md bg-pine-700 px-4 py-2 text-sm text-white"
        >
          {uploading ? `Uploading ${uploading}…` : "Select files"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && void uploadFiles(e.target.files)}
        />
      </div>
      {error ? (
        <ErrorState title="Documents could not be loaded" body={error} onRetry={() => void load()} />
      ) : loading ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="No documents yet" body="Upload a PDF, JPG, or PNG examination paper to begin extraction." />
      ) : (
        <div className="grid gap-3">
          {items.map((doc) => (
            <Card key={doc.id} className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Link href={`/documents/${doc.id}`} className="text-base font-medium hover:underline">
                  {doc.filename}
                </Link>
                <p className="mt-1 text-xs text-ink-500">
                  {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.questionCount} questions · {formatDate(doc.createdAt)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {doc.reviewCount > 0 ? <span className="text-xs text-rust-600">{doc.reviewCount} review</span> : null}
                <StatusBadge status={doc.status} />
                <span className="text-xs text-ink-500">{doc.progress}%</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
