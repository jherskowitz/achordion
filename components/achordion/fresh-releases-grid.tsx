import Link from "next/link";
import { CoverArt } from "./cover-art";
import { caaReleaseUrl } from "@/lib/clients/coverart";
import type { FreshRelease } from "@/lib/clients/listenbrainz";

function formatDate(iso: string): string {
  // iso is "YYYY-MM-DD"
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function startOfWeek(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  // Monday-anchored week
  const day = date.getUTCDay(); // 0 = Sun
  const diff = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

function weekLabel(weekStart: string, today: string): string {
  const start = new Date(weekStart + "T00:00:00Z").getTime();
  const now = new Date(today + "T00:00:00Z").getTime();
  const diffDays = Math.round((now - start) / (1000 * 60 * 60 * 24));
  if (diffDays >= 0 && diffDays < 7) return "This week";
  if (diffDays >= 7 && diffDays < 14) return "Last week";
  if (diffDays < 0 && diffDays >= -7) return "Next week";
  if (diffDays < -7) return `Coming up · week of ${formatDate(weekStart)}`;
  return `Week of ${formatDate(weekStart)}`;
}

function coverFor(r: FreshRelease): string | null {
  if (r.caa_release_mbid && r.caa_id) {
    return `https://archive.org/download/mbid-${r.caa_release_mbid}/mbid-${r.caa_release_mbid}-${r.caa_id}_thumb500.jpg`;
  }
  if (r.release_mbid) return caaReleaseUrl(r.release_mbid, 500);
  return null;
}

export function FreshReleasesGrid({
  releases,
}: {
  releases: FreshRelease[];
}) {
  if (releases.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No releases match these filters.
      </p>
    );
  }

  // Sort by release_date desc and bucket by Monday-anchored week
  const sorted = releases
    .slice()
    .sort((a, b) => b.release_date.localeCompare(a.release_date));
  const today = new Date().toISOString().slice(0, 10);

  const buckets = new Map<string, FreshRelease[]>();
  for (const r of sorted) {
    const week = startOfWeek(r.release_date);
    if (!buckets.has(week)) buckets.set(week, []);
    buckets.get(week)!.push(r);
  }

  return (
    <div className="space-y-12">
      {Array.from(buckets.entries()).map(([weekStart, items]) => (
        <section key={weekStart}>
          <h3 className="text-muted-foreground mb-4 text-xs tracking-wide uppercase">
            {weekLabel(weekStart, today)}
          </h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((r) => {
              const target = r.release_group_mbid
                ? `/release-group/${r.release_group_mbid}`
                : `/release/${r.release_mbid}`;
              const artistMbid = r.artist_mbids?.[0];
              const cover = coverFor(r);
              return (
                <article
                  key={r.release_mbid}
                  className="group min-w-0"
                >
                  <Link href={target} className="block">
                    <CoverArt
                      src={cover}
                      alt={r.release_name}
                      size={500}
                      className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
                      rounded="md"
                    />
                  </Link>
                  <p className="mt-2 truncate text-sm font-medium">
                    <Link href={target} className="hover:underline">
                      {r.release_name}
                    </Link>
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {artistMbid ? (
                      <Link
                        href={`/artist/${artistMbid}`}
                        className="hover:text-foreground"
                      >
                        {r.artist_credit_name}
                      </Link>
                    ) : (
                      r.artist_credit_name
                    )}
                  </p>
                  <p className="text-muted-foreground/70 mt-1 flex items-center gap-1.5 text-xs">
                    <time dateTime={r.release_date} className="tabular-nums">
                      {formatDate(r.release_date)}
                    </time>
                    {r.release_group_primary_type && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {r.release_group_secondary_type ??
                            r.release_group_primary_type}
                        </span>
                      </>
                    )}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
