import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ExternalLink, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";
import { LbTokenForm } from "@/components/achordion/lb-token-form";
import { LbClientMarketplace } from "@/components/achordion/lb-client-marketplace";
import { MusicServicesCard } from "@/components/achordion/music-services-card";
import { PageShell } from "@/components/achordion/page-shell";
import { clearLbTokenAction } from "../settings/actions";

export const metadata = { title: "Welcome to Achordion" };

interface PageProps {
  searchParams: Promise<{ step?: string }>;
}

export default async function WelcomePage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");

  const tokenConfigured = await hasUserLbToken();
  const sp = await searchParams;
  // Default step: jump straight to step 2 once the token is saved, so a
  // form-submission roundtrip lands on "now connect a service" rather
  // than re-showing the (now-completed) step 1.
  const requested = Number(sp.step);
  const step =
    requested === 1 || requested === 2
      ? requested
      : tokenConfigured
        ? 2
        : 1;

  return (
    <PageShell className="pt-10 pb-20">
      <header className="mb-8">
        <p className="text-muted-foreground inline-flex items-center gap-1.5 text-xs tracking-wide uppercase">
          <Sparkles className="size-3" />
          Welcome
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Let&apos;s get Achordion set up
        </h1>
        <p className="text-muted-foreground mt-2 max-w-2xl text-sm leading-6">
          Hi, <span className="text-foreground">{session.user.mbUsername}</span>{" "}
          — a couple of minutes of setup will unlock LB Radio embedding,
          fresh-release filtering, your feed, and listening-along on user
          profiles. You can always finish later in{" "}
          <Link
            href="/settings/connections"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Settings → Connections
          </Link>
          .
        </p>
      </header>

      <ol className="mb-8 flex items-center gap-2 text-sm">
        <StepBubble n={1} active={step === 1} done={tokenConfigured} />
        <span className="bg-border h-px flex-1" />
        <StepBubble n={2} active={step === 2} done={false} />
      </ol>

      {step === 1 ? (
        <Step1LbToken tokenConfigured={tokenConfigured} />
      ) : (
        <Step2Services />
      )}
    </PageShell>
  );
}

function StepBubble({
  n,
  active,
  done,
}: {
  n: number;
  active: boolean;
  done: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
        done
          ? "bg-primary text-primary-foreground"
          : active
            ? "border-foreground/40 text-foreground border"
            : "border-border/60 text-muted-foreground border",
      ].join(" ")}
      aria-current={active ? "step" : undefined}
    >
      {done ? <Check className="size-3.5" /> : n}
    </span>
  );
}

function Step1LbToken({ tokenConfigured }: { tokenConfigured: boolean }) {
  return (
    <section className="space-y-6">
      <div className="border-border/60 bg-card/40 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Step 1 · Paste your ListenBrainz token
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          A user token unlocks LB Radio playlists, fresh releases filtered
          to your library, and writing actions later (pins, edits). Find
          yours on your{" "}
          <a
            href="https://listenbrainz.org/profile/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-foreground hover:underline inline-flex items-center gap-1 underline-offset-4"
          >
            ListenBrainz profile page
            <ExternalLink className="size-3" />
          </a>
          {" "}— it&apos;s a long string under &ldquo;User token&rdquo;.
          Tokens are stored encrypted in an httpOnly cookie; we never log
          them.
        </p>
        <div className="mt-5">
          <LbTokenForm hasToken={tokenConfigured} />
        </div>
        {tokenConfigured && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-foreground inline-flex items-center gap-1.5 text-xs">
              <Check className="size-3.5" />
              Token saved.
            </p>
            <form action={clearLbTokenAction}>
              <button
                type="submit"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                Remove
              </button>
            </form>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/welcome?step=2"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          Skip for now
        </Link>
        <Link
          href="/welcome?step=2"
          className={[
            "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90",
            tokenConfigured
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          ].join(" ")}
        >
          Next: connect scrobbling
        </Link>
      </div>
    </section>
  );
}

function Step2Services() {
  return (
    <section className="space-y-6">
      <div className="border-border/60 bg-card/40 rounded-2xl border p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          Step 2 · Connect scrobbling
        </h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">
          Achordion shows your data — the listens themselves come from
          ListenBrainz. Connect Spotify, Last.fm, or Libre.fm so LB
          captures your plays automatically.{" "}
          <span className="text-muted-foreground/70">
            Already scrobbling from another app or device? You can skip
            this step.
          </span>
        </p>
        <div className="mt-5">
          <MusicServicesCard />
        </div>
      </div>

      <LbClientMarketplace />

      <div className="flex items-center justify-between">
        <Link
          href="/welcome?step=1"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
        <Link
          href="/me"
          className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90"
        >
          Done — take me to Achordion
        </Link>
      </div>
    </section>
  );
}
