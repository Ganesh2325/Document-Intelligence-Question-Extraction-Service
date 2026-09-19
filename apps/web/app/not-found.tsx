export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper-100 px-6 text-center">
      <p className="font-display text-5xl text-ink-900">404</p>
      <p className="mt-3 max-w-md text-ink-500">That page is not part of the Folio workspace.</p>
      <a href="/dashboard" className="mt-6 text-sm text-pine-700 underline">
        Return to dashboard
      </a>
    </div>
  );
}
