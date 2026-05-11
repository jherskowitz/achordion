import Link from "next/link";
import { Suspense } from "react";
import { getAdminStats, type AdminStats } from "@/lib/admin-stats";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminIndexPage() {
  return (
    <div className="space-y-8 text-sm leading-6">
      <p className="text-muted-foreground">
        Direct-write controls for the runtime levers that ship without
        a redeploy.
      </p>

      <Suspense fallback={<StatsSkeleton />}>
        <StatsBlock />
      </Suspense>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
          Controls
        </h2>
        <ul className="space-y-3">
          <li>
            <Link
              href="/admin/flags"
              className="text-foreground hover:underline underline-offset-4"
            >
              Feature flags →
            </Link>
            <p className="text-muted-foreground text-xs">
              Toggle gated surfaces on / off for everyone or for a
              specific allowlist. Backs the same Redis keys
              (<code>flag:&lt;name&gt;:default</code> /{" "}
              <code>flag:&lt;name&gt;:users</code>) you&apos;d edit by
              hand via the Upstash console.
            </p>
          </li>
          <li>
            <Link
              href="/admin/announcements"
              className="text-foreground hover:underline underline-offset-4"
            >
              Announcements →
            </Link>
            <p className="text-muted-foreground text-xs">
              Publish / edit / clear the site-wide banner. Same JSON
              array Parachord-desktop reads — items can be scoped to a
              specific surface via the <code>surfaces</code> field.
            </p>
          </li>
        </ul>
      </section>
    </div>
  );
}

async function StatsBlock() {
  const s = await getAdminStats();
  if (s.unavailable) {
    return (
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
          Stats
        </h2>
        <p className="text-muted-foreground/80 text-xs">
          Upstash isn&apos;t reachable in this environment — stats
          unavailable.
        </p>
      </section>
    );
  }
  return (
    <>
      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
          Reach
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard
            label="Bluesky-linked users"
            value={s.bskyLinkedUsers.toLocaleString()}
            sub="Profiles that completed the two-way bsky handshake in /settings."
          />
          <StatCard
            label="Tracks with links"
            value={s.recordingLinks.toLocaleString()}
            sub={
              <>
                Distinct recording MBIDs with at least one cached
                external service URL.
              </>
            }
          />
          <StatCard
            label="Albums with links"
            value={s.releaseGroupLinks.toLocaleString()}
            sub={
              <>
                Distinct release-group MBIDs with cached entries at{" "}
                <code>track-links:release-group:&lt;mbid&gt;</code>.
              </>
            }
          />
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
          Track-links by source
        </h2>
        <SourceBreakdown sources={s.trackLinkSources} />
        <p className="text-muted-foreground/80 text-[11px] leading-4">
          A single recording can appear in more than one bucket — an
          Odesli-resolved track Parachord later confirmed sits in both
          rows. Bars are independent, not partitioned.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
          Live runtime levers
        </h2>
        <ul className="space-y-1.5 text-xs">
          <li className="flex items-center gap-2">
            <span className="text-muted-foreground">Announcement banner:</span>
            {s.activeAnnouncements > 0 ? (
              <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium">
                {s.activeAnnouncements} live
              </span>
            ) : (
              <span className="text-muted-foreground/80">none</span>
            )}
          </li>
          {s.flagRollouts.map((f) => (
            <li key={f.id} className="flex items-center gap-2">
              <span className="text-muted-foreground">{f.label}:</span>
              <FlagRolloutChip state={f.state} />
              <code className="text-muted-foreground/60 text-[10px]">
                {f.id}
              </code>
            </li>
          ))}
        </ul>
      </section>

      <p className="text-muted-foreground/60 text-[10px]">
        Last computed {formatRelative(s.computedAt)}. Stats refresh
        at most every 5 minutes.
      </p>
    </>
  );
}

function FlagRolloutChip({ state }: { state: AdminStats["flagRollouts"][number]["state"] }) {
  if (!state) {
    return (
      <span className="text-muted-foreground/80 text-[10px]">unavailable</span>
    );
  }
  if (state.defaultValue === "on") {
    return (
      <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium">
        Everyone
      </span>
    );
  }
  if (state.defaultValue === "off") {
    return (
      <span className="bg-destructive/15 text-destructive inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium">
        Kill switch
      </span>
    );
  }
  const n = state.users.length;
  return (
    <span className="bg-muted/60 text-foreground inline-flex h-5 items-center rounded-full px-2 text-[10px] font-medium">
      Allowlist · {n} user{n === 1 ? "" : "s"}
    </span>
  );
}

function SourceBreakdown({
  sources,
}: {
  sources: AdminStats["trackLinkSources"];
}) {
  const max = Math.max(sources.parachord, sources.odesli, sources.mb, 1);
  // Order matches the priority chain — Parachord (highest trust /
  // human-confirmed) first, then Odesli auto-resolution, then MB
  // url-rels (sparse, slow-to-fill, but the official ground truth
  // when present).
  const rows = [
    {
      key: "parachord",
      label: "Parachord (confirmed playback)",
      value: sources.parachord,
      barClass: "bg-primary",
    },
    {
      key: "odesli",
      label: "Odesli (auto-resolved)",
      value: sources.odesli,
      barClass: "bg-blue-500/80",
    },
    {
      key: "mb",
      label: "MusicBrainz url-rels",
      value: sources.mb,
      barClass: "bg-amber-500/80",
    },
  ];
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key} className="space-y-1">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-foreground">{r.label}</span>
            <span className="text-muted-foreground tabular-nums">
              {r.value.toLocaleString()}
            </span>
          </div>
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className={`${r.barClass} h-full`}
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function StatsSkeleton() {
  return (
    <section className="space-y-3">
      <h2 className="text-muted-foreground text-xs tracking-wide uppercase">
        Stats
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <li
            key={i}
            className="border-border/60 space-y-2 rounded-xl border p-4"
          >
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-16" />
            <Skeleton className="h-3 w-32" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
}) {
  return (
    <li className="border-border/60 rounded-xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
        {value}
      </p>
      <p className="text-muted-foreground/80 mt-1.5 text-[11px] leading-4">
        {sub}
      </p>
    </li>
  );
}

/** Coarse "X ago" — server-side, used here for the "last
 *  computed" footer. Not as live-updating as the relative-time
 *  client island; admin viewers reload manually anyway. */
function formatRelative(ts: number): string {
  if (!ts) return "just now";
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 30) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
