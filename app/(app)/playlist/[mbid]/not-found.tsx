import Link from "next/link";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";
import { Button } from "@/components/ui/button";

/**
 * Playlist-scoped 404. ListenBrainz answers 404 for BOTH a private and a
 * deleted playlist when asked without the owner's token, so we can't tell
 * them apart — say that, instead of the bare "page could not be found".
 *
 * When the viewer is signed in but has no personal ListenBrainz token, point
 * them at Settings: the request falls back to the server's token, which can't
 * read their own private playlists, so a real private playlist of theirs lands
 * here. See #108.
 */
export default async function PlaylistNotFound() {
  const [session, hasToken] = await Promise.all([auth(), hasUserLbToken()]);
  const signedInWithoutToken = !!session?.user && !hasToken;
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-start gap-6 px-4 py-24 sm:px-6">
      <p className="text-muted-foreground text-sm tracking-wide uppercase">
        Playlist unavailable
      </p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        This playlist is private or no longer exists.
      </h1>
      <p className="text-muted-foreground">
        ListenBrainz returns the same response for a private playlist and a
        deleted one when we ask without the owner&apos;s token, so we can&apos;t
        tell which it is.
        {signedInWithoutToken ? (
          <>
            {" "}
            If it&apos;s your own private playlist, add your ListenBrainz token
            in{" "}
            <Link
              href="/settings/connections"
              className="text-foreground underline underline-offset-4"
            >
              Settings → Connections
            </Link>{" "}
            so we can load it.
          </>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/" />}
        >
          Back to home
        </Button>
      </div>
    </section>
  );
}
