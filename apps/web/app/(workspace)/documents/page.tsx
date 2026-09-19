"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, apiUrl, authHeaders } from "@/lib/api";
import { Card, EmptyState, StatusBadge, formatDate } from "@/components/ui";
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

  const load = useCallback(async () => {
    const data = await api<Paginated<DocumentRow>>(`/api/v1/documents?limit=50&q=${encodeURIComponent(q)}`);
    setItems(data.items);
  }, [q]);

  useEffect(() => {
    const handle = setTimeout(() => {
      load().catch((err) => push(err.message, "error"));
    }, 250);
    return () => clearTimeout(handle);
  }, [load, push]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (items.some((d) => !["COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "PARTIALLY_COMPLETED"].includes(d.status))) {
        load().catch(() => undefined);
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [items, load]);

  async function uploadFiles(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      setUploading(file.name);
      try {
        const form = new FormData();
        form.append("file", file);
        const created = await fetch(`${apiUrl}/api/v1/documents`, {
          method: "POST",
          headers: authHeaders(),
          body: form,
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
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search filenames"
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
      {items.length === 0 ? (
        <EmptyState title="No documents yet" body="Start with a clean paper, a scanned PDF, or the sample set in /samples." />
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
