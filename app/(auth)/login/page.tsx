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
          <p className="text-muted-foreground mt-6 text-center text-xs">
            Don&apos;t have one?{" "}
            <Link
              href="https://musicbrainz.org/register"
              className="hover:text-foreground underline-offset-4 hover:underline"
            >
              Create a MusicBrainz account
            </Link>
          </p>
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
