import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Globe2, Play, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Globe2,
    title: "One community, every streaming service",
    body: "Spotify, Apple Music, Tidal, Bandcamp, the FLAC library on your NAS — every listener's scrobbles flow into the same feed. See what your friend's playing this week even when you don't share a platform.",
  },
  {
    icon: Play,
    title: "One click plays it, anywhere",
    body: "Pair Achordion with Parachord and every track row, every album, every recommendation has a Play button that resolves against your authorized services and plays from whichever ranks highest.",
  },
  {
    icon: ShieldCheck,
    title: "Your data stays yours",
    body: "Achordion is stateless — no Achordion database, no analytics, no profile of you. Your listens, follows, and playlists live in your ListenBrainz account. Leave whenever, take everything with you.",
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
          An open music community for listeners on every streaming service.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-2xl text-lg leading-7">
          Achordion is the open-source counterpoint to Spotify and Apple
          Music — a modern front-end for{" "}
          <Link
            href="/about"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            MusicBrainz and ListenBrainz
          </Link>
          , designed to feel like one product with{" "}
          <a
            href="https://github.com/Parachord/parachord"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground underline-offset-4 hover:underline"
          >
            Parachord
          </a>
          , the universal music player.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            nativeButton={false}
            render={<Link href="/login" />}
          >
            Continue with MusicBrainz
            <ArrowRight className="size-4" />
          </Button>
          <Button
            size="lg"
            variant="ghost"
            nativeButton={false}
            render={<Link href="/explore" />}
          >
            Browse without signing in
          </Button>
        </div>
      </section>

      <section className="border-border/60 border-t">
        <div className="mx-auto grid max-w-7xl gap-px overflow-hidden px-4 py-16 sm:px-6 md:grid-cols-3 md:gap-8 md:py-20">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="py-2">
              <Icon className="text-muted-foreground size-5" />
              <h3 className="mt-4 text-lg font-semibold tracking-tight">
                {title}
              </h3>
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
