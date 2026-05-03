import Link from "next/link";
import { CoverArt } from "./cover-art";
import { PlayOnHoverFab } from "./play-on-hover-fab";
import { ReleaseTypeChip } from "./release-type-chip";
import { caaReleaseGroupUrl } from "@/lib/clients/coverart";
import { parachordPlayAlbum } from "@/lib/parachord";
import type { DiscographyBucket } from "@/lib/clients/musicbrainz";

const TYPE_LABELS: Record<string, string> = {
  Album: "Albums",
  EP: "EPs",
  Single: "Singles",
  Broadcast: "Broadcasts",
  Other: "Other",
  Compilation: "Compilations",
  Live: "Live",
  Soundtrack: "Soundtracks",
  Remix: "Remixes",
  // Synthetic bucket produced by the artist page when the filter is
  // "Albums + EPs" — entries from both primary types intermingled and
  // sorted by date. The release-type chip lights up per cover so the
  // mix stays scannable.
  Studio: "Albums + EPs",
};

export function Discography({ buckets }: { buckets: DiscographyBucket[] }) {
  if (buckets.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No releases on file at MusicBrainz.
      </p>
    );
  }
  return (
    <div className="space-y-12">
      {buckets.map((bucket) => (
        <section key={bucket.type}>
          <div className="mb-4 flex items-baseline justify-between">
            <h3 className="text-xs tracking-wide uppercase text-muted-foreground">
              {TYPE_LABELS[bucket.type] ?? bucket.type}
            </h3>
            <span className="text-muted-foreground/70 text-xs tabular-nums">
              {bucket.releaseGroups.length}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {bucket.releaseGroups.map((rg) => {
              const year = rg["first-release-date"]?.slice(0, 4);
              // Type chip only on the merged "Studio" bucket — single-
              // type buckets (Album-only / EP-only) don't need it
              // because the section header already labels them.
              const showChip = bucket.type === "Studio";
              return (
                <div key={rg.id} className="min-w-0">
                  <div className="group relative overflow-hidden rounded-md">
                    <Link
                      href={`/release-group/${rg.id}`}
                      className="block"
                    >
                      <CoverArt
                        src={caaReleaseGroupUrl(rg.id, 250)}
                        alt={rg.title}
                        size={240}
                        className="aspect-square h-auto w-full transition-opacity group-hover:opacity-90"
                        rounded="md"
                      />
                    </Link>
                    {showChip && (
                      <ReleaseTypeChip type={rg["primary-type"]} />
                    )}
                    <PlayOnHoverFab
                      href={parachordPlayAlbum({ mbid: rg.id })}
                      label={`Play "${rg.title}" in Parachord`}
                    />
                  </div>
                  <p className="mt-2 truncate text-sm font-medium">
                    <Link
                      href={`/release-group/${rg.id}`}
                      className="hover:underline"
                    >
                      {rg.title}
                    </Link>
                  </p>
                  <p className="text-muted-foreground/80 text-xs tabular-nums">
                    {year ?? "—"}
                    {rg["secondary-types"] && rg["secondary-types"].length > 0 && (
                      <span className="ml-2 capitalize">
                        {rg["secondary-types"][0]}
                      </span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
