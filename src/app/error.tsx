"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-sm pt-16">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-sm text-muted">Try again. If it keeps happening, reload the page.</p>
      <button onClick={reset} className="btn mt-6">
        Try again
      </button>
    </div>
  );
}
