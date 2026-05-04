"use client";

/**
 * Last-resort error boundary. Catches errors that bubble out of the
 * root layout itself — font loading, theme provider, anything inside
 * `<Providers>` — that `app/(app)/error.tsx` can't reach because they
 * happen above the (app) route group.
 *
 * Per Next docs this file MUST render its own `<html>` + `<body>`,
 * because the surrounding root layout has already failed by the time
 * we render. We deliberately keep it minimal — no Tailwind classes,
 * no theme tokens, no fancy fonts — so it can render even if the
 * problem is in our styling pipeline itself.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          margin: 0,
          minHeight: "100vh",
          background: "#0f172a",
          color: "#f1f5f9",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        <main style={{ maxWidth: "32rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.875rem", marginBottom: "0.75rem" }}>
            Something broke at the root.
          </h1>
          <p
            style={{
              color: "#94a3b8",
              lineHeight: 1.55,
              marginBottom: "1.5rem",
            }}
          >
            Achordion hit an error before the page could render. This is
            almost certainly our fault. Try reloading; if it keeps
            happening,{" "}
            <a
              href="https://github.com/jherskowitz/achordion/issues"
              style={{ color: "#a78bfa" }}
            >
              file an issue
            </a>
            .
          </p>
          {error.digest && (
            <p
              style={{
                color: "#64748b",
                fontSize: "0.8125rem",
                marginBottom: "1.5rem",
              }}
            >
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <button
            onClick={() => reset()}
            type="button"
            style={{
              background: "#7c3aed",
              color: "white",
              border: "none",
              padding: "0.6rem 1.25rem",
              borderRadius: "0.5rem",
              fontSize: "0.95rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
