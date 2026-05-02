import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BarChart3, Disc3, Radio } from "lucide-react";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Disc3,
    title: "Your listening, in detail",
    body: "Recent scrobbles, top artists, deep stats — your full ListenBrainz history with a friendlier face.",
  },
  {
    icon: BarChart3,
    title: "Charts that breathe",
    body: "Heatmaps, range pickers, and timelines designed to be looked at, not squinted at.",
  },
  {
    icon: Radio,
    title: "Discover by listening",
    body: "Recommendations, fresh releases, similar listeners, and LB Radio in one explorer.",
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
          A new front-end for ListenBrainz
        </p>
        <h1 className="font-heading max-w-3xl text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl md:text-7xl">
          Your listening data, finally given the design it deserves.
        </h1>
        <p className="text-muted-foreground mt-6 max-w-xl text-lg leading-7">
          Achordion is an open-source alternative client for ListenBrainz —
          built to feel modern, dense, and at home in 2026.
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
