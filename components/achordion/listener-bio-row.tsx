import Link from "next/link";
import { auth } from "@/auth";
import { getBskyLink } from "@/lib/bsky-link";
import { getListenerBio } from "@/lib/listener-bio";
import { isFeatureEnabled } from "@/lib/flags";
import { artistHref } from "@/lib/entity-links";

/**
 * Auto-generated listener bio row.
 *
 * Renders the composed "currently spinning X · N plays this month"
 * sentence as a fallback when the profile owner hasn't linked a
 * Bluesky bio — when they have, `<BlueskyStrip>` renders the bsky
 * version in the same slot and this component short-circuits to
 * null. Bsky-as-override is the editable-bio path; auto-text is
 * the always-on default.
 *
 * Gating order (all must pass to render):
 *   1. Profile owner has NOT linked Bluesky (BlueskyStrip would
 *      otherwise own the slot — never want two bios stacked).
 *   2. The `listener-bio` feature flag is on for the viewer
 *      (kill-switch for emergency turn-off if the composer ever
 *      produces something embarrassing).
 *   3. `getListenerBio` returns a non-null bio (composer drops to
 *      null on cold users with no usable signal).
 *
 * Each variable slot (top-artist names) is a `<Link>` to the
 * canonical `/artist/<mbid>` page — same convention as the
 * Bluesky-bio handle link. Plain-text segments render unwrapped.
 */
export async function ListenerBioRow({ name }: { name: string }) {
  // (1) Bsky-link short-circuit — if the owner has linked, the
  // bsky bio is already rendered by <BlueskyStrip> in the same
  // slot; auto-text would just duplicate that surface.
  const link = await getBskyLink(name);
  if (link) return null;

  // (2) Viewer-flag gate. The flag scopes to the *viewer* (same
  // pattern as bsky-link rollouts) so we can dogfood the auto-bio
  // surface for ourselves without surfacing it to every visitor
  // while we're still tuning the composer.
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  if (!(await isFeatureEnabled("listener-bio", viewer))) return null;

  // (3) Compose. Caching is inside `getListenerBio` (unstable_cache
  // 24h per username), so this is one cache hit in steady state.
  const bio = await getListenerBio(name);
  if (!bio) return null;

  return (
    <p className="text-muted-foreground mt-3 text-sm leading-6">
      {bio.segments.map((seg, i) => {
        if (seg.kind === "text") {
          return <span key={i}>{seg.value}</span>;
        }
        return (
          <Link
            key={i}
            href={artistHref({ mbid: seg.mbid ?? null, name: seg.name })}
            className="text-foreground hover:underline underline-offset-4"
          >
            {seg.name}
          </Link>
        );
      })}
    </p>
  );
}
