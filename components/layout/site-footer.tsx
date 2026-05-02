import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/60 mt-16 border-t">
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-xs sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          Built on{" "}
          <Link
            href="https://listenbrainz.org"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            ListenBrainz
          </Link>{" "}
          and{" "}
          <Link
            href="https://musicbrainz.org"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            MusicBrainz
          </Link>
          .
        </p>
        <nav className="flex items-center gap-4">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/donate" className="hover:text-foreground">
            Donate
          </Link>
          <Link href="/changelog" className="hover:text-foreground">
            Changelog
          </Link>
        </nav>
      </div>
    </footer>
  );
}
