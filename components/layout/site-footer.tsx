import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/60 mt-16 border-t">
      {/* Two-column at sm+: attribution + byline left, nav right.
          Stacks centered on mobile. */}
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-center text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:text-left">
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
          . Made with ❤️ by{" "}
          <a
            href="mailto:j@parachord.com"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            J Herskowitz
          </a>
          .
        </p>
        <nav className="flex items-center justify-center gap-4 sm:justify-end">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/faq" className="hover:text-foreground">
            FAQ
          </Link>
          <Link href="/apps" className="hover:text-foreground">
            Apps
          </Link>
          <Link href="/changelog" className="hover:text-foreground">
            Changelog
          </Link>
          <Link href="/donate" className="hover:text-foreground">
            Donate
          </Link>
          {/* External — explicit anchor so prefetch / Link doesn't try
              to hit the GitHub host as a Next route. */}
          <a
            href="https://github.com/jherskowitz/achordion/discussions"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Discussions
          </a>
          <a
            href="https://github.com/jherskowitz/achordion"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Source Code
          </a>
        </nav>
      </div>
    </footer>
  );
}
