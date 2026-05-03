import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/60 mt-16 border-t">
      {/* Three-column grid at sm+: attributions left, byline
          centered, nav right. Stacks centered on mobile. */}
      <div className="text-muted-foreground mx-auto grid max-w-7xl grid-cols-1 gap-3 px-4 py-8 text-center text-xs sm:grid-cols-3 sm:items-center sm:gap-6 sm:px-6 sm:text-left">
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
        <p className="text-center leading-5">
          Made with ❤️ by{" "}
          <Link
            href="https://github.com/jherskowitz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            J Herskowitz
          </Link>
          <br />
          (and with cold indifference by 🤖)
        </p>
        <nav className="flex items-center justify-center gap-4 sm:justify-end">
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/donate" className="hover:text-foreground">
            Donate
          </Link>
          {/* External — explicit anchor so prefetch / Link doesn't try
              to hit the GitHub host as a Next route. */}
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
