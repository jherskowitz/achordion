import Link from "next/link";
import type { ReleaseStub } from "@/lib/clients/musicbrainz";

function formatFormat(release: ReleaseStub): string | null {
  const formats = (release.media ?? [])
    .map((m) => m.format)
    .filter((f): f is string => Boolean(f));
  if (formats.length === 0) return null;
  const unique = Array.from(new Set(formats));
  return unique.join(" · ");
}

export function EditionsList({
  releases,
  highlightId,
}: {
  releases: ReleaseStub[];
  highlightId?: string;
}) {
  if (releases.length === 0) return null;
  const sorted = releases
    .slice()
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));

  return (
    <ul className="space-y-1.5">
      {sorted.slice(0, 25).map((r) => {
        const isCurrent = r.id === highlightId;
        const country = r.country ?? r["release-events"]?.[0]?.area?.["iso-3166-1-codes"]?.[0];
        const format = formatFormat(r);
        return (
          <li key={r.id}>
            <Link
              href={`/release/${r.id}`}
              className="hover:bg-muted/40 -mx-2 flex items-baseline justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">
                <span className={isCurrent ? "text-foreground font-medium" : ""}>
                  {r.date?.slice(0, 4) ?? "—"}
                </span>
                {country && (
                  <span className="text-muted-foreground/70 ml-2 text-xs">
                    {country}
                  </span>
                )}
                {format && (
                  <span className="text-muted-foreground/70 ml-2 text-xs">
                    {format}
                  </span>
                )}
                {r.disambiguation && (
                  <span className="text-muted-foreground/60 ml-2 text-xs italic">
                    ({r.disambiguation})
                  </span>
                )}
              </span>
              {r["track-count"] !== undefined && r["track-count"] !== null && (
                <span className="text-muted-foreground/70 shrink-0 text-xs tabular-nums">
                  {r["track-count"]} tracks
                </span>
              )}
            </Link>
          </li>
        );
      })}
      {sorted.length > 25 && (
        <li className="text-muted-foreground/70 px-2 text-xs">
          +{sorted.length - 25} more
        </li>
      )}
    </ul>
  );
}
