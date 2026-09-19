"use client";

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="rounded-xl border border-rust-500/30 bg-white p-8">
      <h1 className="font-display text-3xl">This view failed to render</h1>
      <p className="mt-2 text-sm text-ink-500">{error.message}</p>
      <button className="mt-4 rounded-md bg-pine-700 px-4 py-2 text-sm text-white" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
