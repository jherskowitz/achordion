"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

/**
 * Sidebar "social proof" block: shows which of the viewer's followed
 * users are among this entity's top listeners. Intentionally above
 * the (usually-larger) Top Listeners list so the social signal lands
 * before the global one — "people you follow listen to this" is the
 * stronger nudge.
 *
 * Renders nothing when:
 *   - viewer is anonymous (no follow graph),
 *   - viewer has no followed users in the entity's top listeners,
 *   - the API call errors.
 *
 * Mounted on artist + release-group pages. Recording pages reuse
 * the hero album's social proof rather than querying their own
 * (LB has no per-recording top-listeners endpoint).
 */

export type SocialProofEntity = "artist" | "release-group";

interface SocialProofResponse {
  listeners: { userName: string; listenCount: number }[];
}

export function SocialProof({
  entity,
  mbid,
}: {
  entity: SocialProofEntity;
  mbid: string;
}) {
  const { status: sessionStatus } = useSession();
  const { data, isLoading, error } = useQuery<SocialProofResponse>({
    queryKey: ["social-proof", entity, mbid],
    queryFn: async () => {
      const r = await fetch(
        `/api/social-proof/${entity}/${encodeURIComponent(mbid)}`,
        { credentials: "same-origin" },
      );
      if (!r.ok) throw new Error(`social-proof ${r.status}`);
      return r.json();
    },
    enabled: sessionStatus === "authenticated",
    // The block doesn't shift between sessions — once we know who's
    // listening among the viewer's friends, that's stable for hours.
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (sessionStatus !== "authenticated") return null;
  if (isLoading || error) return null;
  const matches = data?.listeners ?? [];
  if (matches.length === 0) return null;

  const headlineCount = matches.length;
  const headlineNoun = entityNoun(entity);

  return (
    <section>
      <h2 className="text-muted-foreground mb-3 text-xs tracking-wide uppercase">
        Friends listening
      </h2>
      <p className="text-muted-foreground mb-3 text-xs">
        <span className="text-foreground font-medium">{headlineCount}</span>{" "}
        {headlineCount === 1 ? "person" : "people"} you follow listen{headlineCount === 1 ? "s" : ""} to this {headlineNoun}
        .
      </p>
      <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
        {matches.slice(0, 8).map((m) => (
          <li key={m.userName} className="flex items-center gap-2 py-2 text-xs">
            <Link
              href={`/user/${encodeURIComponent(m.userName)}`}
              className="text-foreground hover:underline truncate font-medium"
            >
              {m.userName}
            </Link>
            <span className="text-muted-foreground tabular-nums ml-auto">
              {m.listenCount.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function entityNoun(entity: SocialProofEntity): string {
  return entity === "artist" ? "artist" : "album";
}
