import Link from "next/link";
import type { Metadata } from "next";
import { signIn } from "@/auth";
import { Wordmark } from "@/components/layout/wordmark";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Achordion with your MusicBrainz account.",
};

export default function LoginPage() {
  async function continueWithMusicBrainz() {
    "use server";
    await signIn("musicbrainz", { redirectTo: "/me" });
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Wordmark />
        </div>
        <div className="border-border/60 bg-card/40 rounded-2xl border p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground mt-2 text-sm leading-6">
            Achordion uses your MusicBrainz account for sign-in — the same
            identity that powers ListenBrainz. We never see your password.
          </p>
          <form action={continueWithMusicBrainz} className="mt-8">
            <Button type="submit" size="lg" className="w-full">
              Continue with MusicBrainz
            </Button>
          </form>
        </div>

        <div className="border-border/60 bg-card/20 mt-4 rounded-2xl border p-6">
          <h2 className="text-sm font-semibold tracking-wide uppercase">
            New to MusicBrainz?
          </h2>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            MusicBrainz is the open music database that powers your
            ListenBrainz scrobbles, edits, and listening history. It&apos;s
            free, run by a non-profit, and your account works across every
            ListenBrainz client — including Achordion.
          </p>
          <ol className="text-muted-foreground mt-3 space-y-1 text-xs leading-5">
            <li>
              <span className="text-foreground font-medium">1.</span> Sign
              up at MusicBrainz (takes a minute).
            </li>
            <li>
              <span className="text-foreground font-medium">2.</span>{" "}
              Verify your email.
            </li>
            <li>
              <span className="text-foreground font-medium">3.</span> Come
              back here and click &ldquo;Continue with MusicBrainz&rdquo;.
            </li>
          </ol>
          <a
            href="https://musicbrainz.org/register"
            target="_blank"
            rel="noopener noreferrer"
            className="border-border/60 hover:bg-muted/40 hover:text-foreground text-muted-foreground mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-colors"
          >
            Create a MusicBrainz account
            <span aria-hidden>↗</span>
          </a>
        </div>
        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            ← Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
