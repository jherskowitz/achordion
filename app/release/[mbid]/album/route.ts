import { getRelease } from "@/lib/clients/musicbrainz";

const MBID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Redirect to the release-group ("album") that contains this specific
 * release. Used by playlist track rows where the album name should link
 * to the canonical album page rather than a specific edition. The MB
 * lookup fires on click rather than on render, so a 50-track playlist
 * doesn't pay 50 lookup costs up front.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mbid: string }> },
) {
  const { mbid } = await params;
  if (!MBID.test(mbid)) {
    return new Response("Invalid release MBID", { status: 400 });
  }

  let target = `/release/${mbid}`;
  try {
    const release = await getRelease(mbid);
    const rgId = release["release-group"]?.id;
    if (rgId) target = `/release-group/${rgId}`;
  } catch {
    // Fall through to the bare release page on lookup failure.
  }

  return Response.redirect(new URL(target, request.url), 302);
}
