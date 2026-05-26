"use client";

import { useEffect, useState } from "react";

export const dynamic = "force-dynamic";

export default function GoPage() {
  const [uri, setUri] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("uri") ?? "";
    // Accept either the HTTPS Universal Link / App Link form (the
    // shape Achordion emits as of issue #63) OR the legacy
    // `parachord://` custom scheme (still valid for in-app webviews,
    // share intents, and any stored bookmarks / RSS feeds that
    // pre-date the switch). Anything else is a protocol-injection
    // attempt.
    if (
      !raw.startsWith("parachord://") &&
      !raw.startsWith("https://parachord.com/")
    ) {
      return;
    }
    setUri(raw);
    // Attempt the deep-link. If a registered handler exists, the page is
    // replaced; if not, this is a no-op and the user sees the fallback UI.
    window.location.href = raw;
    setAttempted(true);
  }, []);

  if (!uri) {
    return (
      <main className="mx-auto max-w-md px-4 py-12">
        <h1 className="text-2xl font-semibold mb-4">Open in Parachord</h1>
        <p className="text-muted-foreground">
          This link is missing or malformed. Did you mean to share a
          <code className="px-1">https://parachord.com/…</code> URL?
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-semibold mb-2">Opening Parachord…</h1>
      <p className="text-muted-foreground mb-6">
        If nothing happened, you may not have Parachord installed.
      </p>
      <button
        onClick={() => (window.location.href = uri)}
        className="px-4 py-2 rounded-md border"
      >
        Try again
      </button>
      <p className="mt-8 text-sm">
        <a
          href="https://parachord.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Get Parachord →
        </a>
      </p>
    </main>
  );
}
