import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Globe2, Network, Play, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";

// Inline-link styling for external references on the home page —
// matches the about/donate pages' sky-blue editorial links.
//
// `underline` is permanent (not hover-only) so links inside running
// text are distinguishable by something other than color alone — WCAG
// 1.4.1 (Use of Color) requires this for prose links. The sky-600
// color still differentiates from black body text; underline is the
// secondary cue.
const LINK_CLASS =
  "text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 underline underline-offset-4 decoration-sky-600/40 hover:decoration-current dark:decoration-sky-400/40";

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={LINK_CLASS}
    >
      {children}
    </a>
  );
}

const FEATURES: Array<{
  icon: typeof Globe2;
  title: string;
  body: React.ReactNode;
}> = [
  {
    icon: Globe2,
    title: "One community, no matter how you listen",
    body: "Spotify, Apple Music, Tidal, Bandcamp, the FLAC library on your NAS — every member's listening data can flow into the same feed. See what your friend's playing this week, or listen along in real-time, even when you don't share a platform.",
  },
  {
    icon: Play,
    title: "One click plays it, anywhere",
    body: (
      <>
        Pair Achordion with{" "}
        <Ext href="https://parachord.com">Parachord</Ext> and every track row,
        every album, every recommendation has a Play button that resolves
        against your music library and services - and plays from whichever
        ranks highest. Without{" "}
        <Ext href="https://parachord.com">Parachord</Ext> you are still
        provided links to multiple streaming services and storefronts - no
        matter your preference.{" "}
      </>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Your listening data, not ours",
    body: (
      <>
        Achordion doesn&apos;t store your listening data. There&apos;s no
        Achordion-side profile of you, no record of what you&apos;ve played,
        no record of who you follow. Your listens, follows, and playlists
        live in your{" "}
        <Ext href="https://listenbrainz.org">ListenBrainz</Ext> account.
        Leave whenever, take everything with you.
      </>
    ),
  },
  {
    icon: Network,
    title: "Help build the open web of music",
    body: (
      <>
        Every artist link, every missing relationship, every &quot;+ Add
        sources&quot; tile points back to{" "}
        <Ext href="https://musicbrainz.org">MusicBrainz</Ext> — the
        open-source music database that powers Achordion and every other
        client like it. Fix something once and the whole open ecosystem gets
        better.
      </>
    ),
  },
];

export default async function HomePage() {
  const session = await auth();
  if (session?.user?.mbUsername) {
    redirect(`/user/${session.user.mbUsername}`);
  }
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24">
        <p className="text-muted-foreground mb-6 text-sm tracking-wide uppercase">
          The independent music community
        </p>
        <h1 className="font-heading max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl">
          People-Powered Music Discovery
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-7">
        Music discovery felt a lot more meaningful (and fun) when we weren&apos;t all trapped in our own algorithmic bubbles — locked away inside corporate silos. </p>
 <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-7">Achordion is part of an open community, powered by <Ext href="https://listenbrainz.org">ListenBrainz</Ext>, that puts listeners first — no matter how or where they listen. Connect with like-minded listeners across the globe to discover music that transcends services, platforms, and programming.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            <Image
              src="/musicbrainz-logo.svg"
              alt=""
              width={16}
              height={18}
              aria-hidden
              className="size-4"
            />
            Login with a MusicBrainz account
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/explore/critical-darlings" />}
          >
            Browse without signing in
          </Button>
        </div>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden px-4 py-16 sm:grid-cols-2 sm:px-6 md:gap-8 md:py-20 lg:grid-cols-4">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="py-2">
              <Icon className="text-muted-foreground size-5" />
              {/* h2 (not h3) so the heading hierarchy from the hero
                  <h1> down through these feature cards is sequentially
                  descending — Lighthouse + screen readers both flag a
                  jump from h1 → h3 as a real a11y issue. */}
              <h2 className="mt-4 text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <p className="text-muted-foreground mt-2 max-w-sm text-sm leading-6">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
