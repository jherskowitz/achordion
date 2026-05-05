import { ArrowUpRight, Heart } from "lucide-react";
import { PageShell } from "@/components/achordion/page-shell";
import { PageHeader } from "@/components/achordion/page-header";

export const metadata = { title: "Donate" };

// Shared inline-link colour with the about page — sky-500/-400 reads
// well on the page background in both light and dark modes.
const LINK_CLASS =
  "text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 hover:underline underline-offset-4";

interface DonateCardProps {
  title: string;
  blurb: string;
  href: string;
  primary?: boolean;
}

function DonateCard({ title, blurb, href, primary }: DonateCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border/60 hover:border-foreground/40 hover:bg-muted/40 group flex flex-col gap-3 rounded-xl border p-6 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3
          className={
            primary
              ? "text-foreground text-lg font-semibold"
              : "text-foreground text-base font-semibold"
          }
        >
          {title}
        </h3>
        <ArrowUpRight className="text-muted-foreground/70 group-hover:text-foreground size-4 shrink-0 transition-colors" />
      </div>
      <p className="text-muted-foreground text-sm leading-6">{blurb}</p>
    </a>
  );
}

export default function DonatePage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Donate"
        title="Support the projects that make this possible"
        description="Achordion sits on top of MetaBrainz infrastructure. If you enjoy it, please support MusicBrainz and ListenBrainz first — they do the heavy lifting and they run on donations."
      />

      {/* Left-aligned at the page edge so the subhead and section
          bodies share a left rail with the PageHeader title above. */}
      <div className="max-w-3xl space-y-12 pb-12">
        {/* MetaBrainz first — they're the actual nonprofit. */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            <Heart className="mr-1.5 inline size-4 align-text-bottom text-rose-500" />
            Start here: MetaBrainz Foundation
          </h2>
          <p className="text-foreground/90 text-base leading-7">
            The MetaBrainz Foundation is the 501(c)(3) nonprofit that
            operates MusicBrainz, ListenBrainz, Cover Art Archive, AcousticBrainz,
            and the surrounding open-data infrastructure. Every artist,
            album, recording, listen, cover image, and listener stat
            you see on Achordion comes from data they host and serve —
            for free, on a small staff, funded almost entirely by
            individual donations and a handful of corporate sponsors.
          </p>
          <p className="text-foreground/90 text-base leading-7">
            If you can spare even a few dollars a month, it goes
            directly to keeping the open music data ecosystem alive —
            far beyond Achordion. They take one-time gifts and
            recurring memberships in just about every form (PayPal,
            credit card, GitHub Sponsors, crypto, mailed cheques, the
            works).
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DonateCard
              primary
              title="Donate to MetaBrainz"
              blurb="One-time, recurring, or membership. Goes to MusicBrainz, ListenBrainz, Cover Art Archive, and the rest of their open-data stack."
              href="https://metabrainz.org/donate"
            />
            <DonateCard
              title="Become a supporter"
              blurb="Recurring membership tiers — direct line to keeping the lights on at the Foundation."
              href="https://metabrainz.org/supporters"
            />
          </div>
        </section>

        {/* Then Achordion / Parachord. Smaller, less essential — be
            honest about that. */}
        <section className="space-y-4">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Or chip in for Achordion + Parachord
          </h2>
          <p className="text-foreground/90 text-base leading-7">
            Achordion and{" "}
            <a
              href="https://github.com/Parachord/parachord"
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              Parachord
            </a>{" "}
            are open-source side projects with no corporate backing.
            Hosting is cheap, but contributions help cover deploys,
            domains, and the occasional API key. Every dollar helps
            keep the projects ad-free, tracker-free, and built for
            the listeners.
          </p>
          <p className="text-muted-foreground text-sm leading-6">
            Genuinely though — if you have to choose, give to
            MetaBrainz. They&apos;re the load-bearing wall.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DonateCard
              title="Ko-fi"
              blurb="One-time tips or monthly memberships. 0% platform fee on tips — every dollar goes to project costs."
              href="https://ko-fi.com/jherskowitz"
            />
            <DonateCard
              title="Star the repos"
              blurb="Free and surprisingly helpful — visibility on GitHub is the cheapest way to help these projects find collaborators."
              href="https://github.com/jherskowitz/achordion"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            Other ways to help
          </h2>
          <ul className="text-foreground/90 ml-6 list-disc space-y-2 text-base leading-7">
            <li>
              <strong>Edit MusicBrainz.</strong>{" "}
              Found a wrong artist credit, missing release, broken Spotify
              URL? MB is a wiki — you can fix it. Achordion will pick up
              the fix on the next cache cycle. The &quot;+ Add sources&quot;
              tile next to every streaming row goes straight to the right
              edit page.
            </li>
            <li>
              <strong>Submit listens to ListenBrainz.</strong>{" "}
              If you&apos;re scrobbling to last.fm but not LB, switch (or
              dual-scrobble). LB&apos;s data quality scales with its user
              base.
            </li>
            <li>
              <strong>File issues / PRs on Achordion.</strong>{" "}
              Bug reports, feature requests, code — all welcome at{" "}
              <a
                href="https://github.com/jherskowitz/achordion"
                target="_blank"
                rel="noopener noreferrer"
                className={LINK_CLASS}
              >
                github.com/jherskowitz/achordion
              </a>.
            </li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
