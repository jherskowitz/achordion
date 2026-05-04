import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ExternalLink, Play, Sparkles } from "lucide-react";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";
import { LbTokenForm } from "@/components/achordion/lb-token-form";
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
    requested === 1 || requested === 2 || requested === 3
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
          — a couple of minutes of setup will unlock ListenBrainz Radio
          embedding, fresh-release filtering, your feed, and listening-along
          on user profiles. You can always finish later in{" "}
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
        {/* A bubble flips to "done" once the user has navigated past it
            (step > n). Step 1 also flips done when the token is saved
            even while the user is still on step 1 — gives instant
            confirmation that the form submission landed. The connector
            lines fill in to match: the line BEFORE bubble n is filled
            when bubble n's prior step is done. */}
        <StepBubble n={1} active={step === 1} done={step > 1 || tokenConfigured} />
        <Connector filled={step > 1 || tokenConfigured} />
        <StepBubble n={2} active={step === 2} done={step > 2} />
        <Connector filled={step > 2} />
        <StepBubble n={3} active={step === 3} done={false} optional />
        <span className="text-muted-foreground text-xs">
          (optional)
        </span>
      </ol>

      {step === 1 ? (
        <Step1LbToken tokenConfigured={tokenConfigured} />
      ) : step === 2 ? (
        <Step2Services />
      ) : (
        <Step3Parachord />
      )}
    </PageShell>
  );
}

function StepBubble({
  n,
  active,
  done,
  optional,
}: {
  n: number;
  active: boolean;
  done: boolean;
  optional?: boolean;
}) {
  return (
    <span
      className={[
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors",
        done
          ? "bg-primary text-primary-foreground"
          : active
            ? "border-foreground/40 text-foreground border"
            : optional
              ? "border-border/60 border-dashed text-muted-foreground border"
              : "border-border/60 text-muted-foreground border",
      ].join(" ")}
      aria-current={active ? "step" : undefined}
    >
      {done ? <Check className="size-3.5" /> : n}
    </span>
  );
}

function Connector({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden
      className={[
        "h-px flex-1 transition-colors",
        filled ? "bg-primary" : "bg-border",
      ].join(" ")}
    />
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
          A user token unlocks ListenBrainz Radio playlists, fresh releases filtered
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
        <p className="text-muted-foreground/70 mt-4 text-xs leading-5">
          Using a different scrobbler? Plenty of third-party LB clients
          exist (Pano Scrobbler, Web Scrobbler, Multi-Scrobbler, etc.) —
          you&apos;ll find the full list in{" "}
          <Link
            href="/settings/connections"
            className="text-foreground underline-offset-4 hover:underline"
          >
            Settings → Connections
          </Link>{" "}
          after onboarding.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/welcome?step=1"
          className="text-muted-foreground hover:text-foreground text-sm underline-offset-4 hover:underline"
        >
          ← Back
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/me"
            className="bg-primary text-primary-foreground inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            Done — take me to Achordion
          </Link>
          <Link
            href="/welcome?step=3"
            className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-2 text-sm underline-offset-4 hover:underline"
          >
            Optional: install Parachord →
          </Link>
        </div>
      </div>
    </section>
  );
}

function Step3Parachord() {
  return (
    <section className="space-y-6">
      <div className="border-border/60 bg-card/40 overflow-hidden rounded-2xl border p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            Step 3 · Install Parachord
          </h2>
          <span className="border-border/60 text-muted-foreground inline-flex items-center rounded-full border border-dashed px-2 py-0.5 text-[11px] font-medium tracking-wide uppercase">
            Optional
          </span>
        </div>
        <p className="text-foreground mt-3 text-sm leading-6">
          <strong>This step is completely optional — Achordion works
          great without it.</strong> Every page, chart, feed, and stat
          you came here for is fully functional with just steps 1 and 2.
          Parachord is the icing: install it and every Play button on the
          site can launch instantly, so you can hear what you&apos;re
          looking at without leaving the page.
        </p>
        <p className="text-muted-foreground mt-3 text-sm leading-6">
          Under the hood: Achordion is the data layer; Parachord is the
          player. Every Play button hands a tracklist off via a{" "}
          <code className="bg-muted text-foreground rounded px-1 py-0.5 text-[12px]">
            parachord://
          </code>{" "}
          deep link — Parachord wakes (if it isn&apos;t running), resolves
          the tracks against your authorized services, and plays from
          whichever source ranks highest in your priority order.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <a
            href="https://parachord.com"
            target="_blank"
            rel="noopener noreferrer"
            className="bg-foreground text-background inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-opacity hover:opacity-90"
          >
            <Play className="size-3.5 fill-current" />
            Get Parachord
            <ExternalLink className="size-3" />
          </a>
          <a
            href="https://github.com/Parachord/parachord"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline"
          >
            Source on GitHub
            <ExternalLink className="size-3" />
          </a>
        </div>

        {/* Self-hosted from public/ — no remote-pattern allowlist hassle,
            and the image ships with the bundle so it works offline in
            dev. Source: parachord.com/assets/hero.png */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/parachord-hero.png"
          alt="The Parachord desktop app, showing a Now Playing view with album art and queue"
          width={1512}
          height={927}
          className="border-border/40 mt-6 block w-full rounded-xl border"
        />

        <div className="border-border/60 mt-6 rounded-xl border p-4">
          <p className="text-foreground inline-flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Sparkles className="size-3" />
            What to expect
          </p>
          <p className="text-muted-foreground/90 mt-2 text-sm leading-6">
            The first time you click a Play button on Achordion, your browser
            asks <em>&ldquo;achordion.xyz wants to access other apps and
            services on this device.&rdquo;</em> That&apos;s the browser&apos;s
            generic phrasing — what it&apos;s actually asking is whether
            Achordion can hand <code className="bg-muted text-foreground rounded px-1 py-0.5 text-[11px]">parachord://</code>{" "}
            links off to Parachord. Click <strong>Allow</strong> and Play
            buttons work site-wide from then on.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/welcome?step=2"
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
