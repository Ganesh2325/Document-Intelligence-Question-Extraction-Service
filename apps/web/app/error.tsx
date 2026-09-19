"use client";

export default function ErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const network = /failed to fetch|network|unavailable|load failed/i.test(error.message);
  return (
    <div className="rounded-xl border border-rust-500/30 bg-white p-8">
      <h1 className="font-display text-3xl">{network ? "API unreachable" : "This view failed to render"}</h1>
      <p className="mt-2 text-sm text-ink-500">
        {network
          ? "The Folio API could not be reached. Confirm it is running, then try again."
          : error.message}
      </p>
      <button className="mt-4 rounded-md bg-pine-700 px-4 py-2 text-sm text-white" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
