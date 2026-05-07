import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  getArtistListeners,
  getFollowing,
  getReleaseGroupListeners,
} from "@/lib/clients/listenbrainz";

/**
 * Per-viewer "social proof" for an entity: which of the people you
 * follow on ListenBrainz are also among this entity's top listeners.
 *
 * Pattern: the host route (artist / release-group) is edge-cached for
 * everyone. Social proof is per-viewer (depends on the session-bound
 * follow graph), so it can't share the page cache. Like AlbumReviews,
 * it's a client island that fetches this endpoint after hydration.
 *
 * Implementation is a cheap intersection: the entity already exposes
 * a top-listeners list (`getArtistListeners` / `getReleaseGroupListeners`,
 * each cached per-MBID at the LB layer), we cross-reference it with
 * the viewer's following list (`getFollowing`, also cached). No
 * per-friend lookups needed — only friends who are heavy listeners
 * surface, which is the right bar for "social proof" anyway.
 *
 * Recordings get no special endpoint here yet because LB has no
 * per-recording top-listeners API — the album-level data is what
 * the recording page already shows in its sidebar.
 */

export const dynamic = "force-dynamic";

const NO_STORE: Record<string, string> = {
  "Cache-Control": "private, no-store, max-age=0, must-revalidate",
};

const ALLOWED_ENTITIES = new Set(["artist", "release-group"]);

interface SocialProofEntry {
  userName: string;
  listenCount: number;
}

async function fetchEntityListeners(
  entity: "artist" | "release-group",
  mbid: string,
): Promise<{ user_name: string; listen_count: number }[]> {
  if (entity === "artist") {
    const data = await getArtistListeners(mbid).catch(() => null);
    return data?.listeners ?? [];
  }
  const data = await getReleaseGroupListeners(mbid).catch(() => null);
  return data?.listeners ?? [];
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ entity: string; mbid: string }> },
): Promise<NextResponse> {
  const { entity: entityRaw, mbid } = await params;
  if (!ALLOWED_ENTITIES.has(entityRaw)) {
    return NextResponse.json(
      { listeners: [] satisfies SocialProofEntry[] },
      { headers: NO_STORE },
    );
  }
  const entity = entityRaw as "artist" | "release-group";

  const session = await auth();
  const viewer = session?.user?.mbUsername;
  if (!viewer) {
    // Anonymous viewers have no follow graph — return empty so the
    // client renders nothing. Using 200 (not 401) since this is an
    // optional enrichment, not a permission failure.
    return NextResponse.json(
      { listeners: [] satisfies SocialProofEntry[] },
      { headers: NO_STORE },
    );
  }

  // Parallel: viewer's following list + entity's top listeners.
  // Both already cached at the LB client layer, so even when the
  // page is uncached this stays fast.
  const [following, listeners] = await Promise.all([
    getFollowing(viewer).catch(() => [] as string[]),
    fetchEntityListeners(entity, mbid),
  ]);

  if (following.length === 0 || listeners.length === 0) {
    return NextResponse.json(
      { listeners: [] satisfies SocialProofEntry[] },
      { headers: NO_STORE },
    );
  }

  // Case-sensitive intersection (LB usernames are case-sensitive).
  const followSet = new Set(following);
  const matched: SocialProofEntry[] = listeners
    .filter((l) => followSet.has(l.user_name))
    .map((l) => ({ userName: l.user_name, listenCount: l.listen_count }))
    .sort((a, b) => b.listenCount - a.listenCount);

  return NextResponse.json({ listeners: matched }, { headers: NO_STORE });
}
