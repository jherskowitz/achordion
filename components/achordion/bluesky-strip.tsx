import { auth } from "@/auth";
import { getBskyLink } from "@/lib/bsky-link";
import { getBskyDisplayProfile } from "@/lib/bsky-display";
import { BlueskyTooltipPill } from "./bluesky-tooltip-pill";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://achordion.xyz";

/**
 * Strip the verification URL (and the line it sits on) out of the
 * rendered bio. The user added their Achordion profile link to their
 * Bluesky bio purely to prove ownership during verification — there's
 * no reason to surface it back to viewers on the Achordion page they
 * already came from. We also strip any orphaned whitespace / blank
 * lines left behind so the bio doesn't show a gap where the URL was.
 */
function cleanBio(bio: string, lbUsername: string): string {
  const expected = `${SITE_URL}/user/${lbUsername}`;
  // Escape regex specials in the URL.
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Match the URL and any trailing whitespace, optionally with a
  // leading newline so we collapse the orphaned blank line too.
  return bio
    .replace(new RegExp(`\\n?\\s*${escaped}/?\\s*`, "gi"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Bluesky-identity row rendered under a profile's username.
 *
 * Layout: <bsky favicon (tooltip = handle)>  <bio text shown inline>
 *
 * Renders nothing when:
 *   - the feature flag is off for the viewer,
 *   - the profile owner hasn't linked a Bluesky account, or
 *   - Bluesky's public AppView is unreachable.
 *
 * Flag is gated on the *viewer*, not the profile owner. While the
 * feature is in allowlist mode, profiles that have linked Bluesky
 * stay invisible to non-allowlisted viewers — the rollout is fully
 * invisible until the flag flips to "on".
 *
 * The header's avatar override hits the same `getBskyDisplayProfile`
 * call earlier in the render; the unstable_cache slot keyed by DID
 * makes this a cache hit, so there's no double fetch.
 */
export async function BlueskyStrip({ name }: { name: string }) {
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  const profile = await getBskyDisplayProfile(name, viewer);
  if (!profile) return null;
  // The stored handle is what we deep-link to bsky.app with — the
  // live `profile.handle` could be momentarily stale if the user
  // just rotated to a custom domain.
  const link = await getBskyLink(name);
  if (!link) return null;
  const rawBio = profile.description?.trim();
  const bio = rawBio ? cleanBio(rawBio, name) : "";

  return (
    <div className="mt-2 flex items-start gap-2">
      <BlueskyTooltipPill
        handle={link.handle}
        displayName={profile.displayName}
      />
      {bio && (
        <p className="text-muted-foreground text-sm leading-6 whitespace-pre-line">
          {bio}
        </p>
      )}
    </div>
  );
}
