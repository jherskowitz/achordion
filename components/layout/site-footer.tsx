import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/60 mt-16 border-t">
      {/* Two-column at sm+: attribution + byline left, nav right.
          Stacks centered on mobile. */}
      <div className="text-muted-foreground mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-center text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:text-left">
        <p>
          <span className="block sm:inline">
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
          </span>{" "}
          {/* `block sm:inline` so on mobile this byline drops to its
              own line instead of running on at the end of the
              "Built on…" sentence — at narrow widths the run-on
              wraps awkwardly mid-sentence. Desktop reads as one
              continuous line. */}
          <span className="block sm:inline">
            Made with ❤️ by{" "}
            <a
              href="mailto:j@parachord.com"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              J Herskowitz
            </a>
            .
          </span>
        </p>
        {/* Mobile: 2-column grid so the seven links don't crush into
            a single horizontally-scrolling row. Each cell is its own
            tap target with breathing room. At sm+ we go back to the
            single-row flex with right-justified alignment. */}
        <nav className="grid grid-cols-2 gap-x-6 gap-y-2 justify-items-center sm:flex sm:items-center sm:justify-end sm:gap-4">
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
          {/* External — explicit anchors so prefetch / Link doesn't
              try to hit external hosts as Next routes. */}
          <a
            href="https://parachord.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            Parachord
          </a>
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
