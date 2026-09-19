export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: "bg-pine-700/10 text-pine-700",
    PARTIALLY_COMPLETED: "bg-gold-500/15 text-gold-600",
    REVIEW_REQUIRED: "bg-rust-500/10 text-rust-600",
    FAILED: "bg-rust-500/15 text-rust-600",
    CANCELLED: "bg-ink-500/10 text-ink-500",
    QUEUED: "bg-pine-500/10 text-pine-700",
    UPLOADED: "bg-ink-500/10 text-ink-700",
  };
  const cls = map[status] ?? "bg-gold-500/15 text-gold-600";
  const processing = !["COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED", "REVIEW_REQUIRED", "UPLOADED"].includes(status);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${cls}`}>
      {processing ? <span className="h-1.5 w-1.5 animate-[pulse-soft_1.4s_ease_infinite] rounded-full bg-current" /> : null}
      <span className="sr-only">Status:</span>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function ConfidenceMeter({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-sm text-ink-500">—</span>;
  const pct = Math.round(value * 100);
  const band = value >= 0.85 ? "high" : value >= 0.7 ? "medium" : "review";
  const label = band === "high" ? "High confidence" : band === "medium" ? "Medium confidence" : "Needs review";
  const bar = band === "high" ? "bg-pine-600" : band === "medium" ? "bg-gold-500" : "bg-rust-500";
  return (
    <div className="min-w-[8rem]">
      <div className="mb-1 flex items-center justify-between text-xs text-ink-500">
        <span>{label}</span>
        <span className="font-medium text-ink-900">{pct}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-paper-200" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-paper-200 bg-white px-6 py-16 text-center">
      <p className="font-display text-2xl text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{body}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton rounded ${className ?? "h-4 w-full"}`} />;
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-paper-200 bg-white p-5 shadow-card ${className}`}>{children}</div>;
}

export function formatDate(value?: string | Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDuration(ms?: number | null) {
  if (!ms && ms !== 0) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}
