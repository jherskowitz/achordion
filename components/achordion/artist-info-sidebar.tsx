import Link from "next/link";
import type {
  ArtistDetail,
  ArtistExternalLink,
  ArtistMember,
} from "@/lib/clients/musicbrainz";
import { partitionArtistRelations } from "@/lib/clients/musicbrainz";
import type { ArtistListeners } from "@/lib/clients/listenbrainz";
import { ExternalLinks } from "./external-links";
import { TopListenersList } from "./top-listeners-list";

interface FactProps {
  label: string;
  children: React.ReactNode;
}

function Fact({ label, children }: FactProps) {
  return (
    <div>
      <dt className="text-muted-foreground/70 text-xs tracking-wide uppercase">
        {label}
      </dt>
      <dd className="text-foreground mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * Format one membership span as a string ("1995–1998" / "since 2010"
 * / "1995–"). Returns null when there's no begin date to anchor it.
 */
function formatSpan(entry: ArtistMember): string | null {
  if (entry.begin && entry.end) return `${entry.begin}–${entry.end}`;
  if (entry.begin) return entry.ended ? `${entry.begin}–` : `since ${entry.begin}`;
  return null;
}

interface CollapsedMember {
  artist: ArtistMember["artist"];
  /** Union of all roles across every span (e.g. ["lead vocals", "guitar"]). */
  attributes: string[];
  /** Each membership stint as a formatted string. */
  spans: string[];
}

/**
 * Collapse repeated entries for the same person into a single row.
 *
 * MB models membership as one relation per (artist, role, span) — so a
 * guitarist who left and rejoined a band, or a multi-instrumentalist
 * who played both keys and guitar, ends up as multiple `ArtistMember`
 * entries with the same `artist.id`. Rendering those raw produces a
 * noisy list with the same name repeated 3–5 times.
 *
 * We merge by mbid:
 *   - Attributes are unioned (case-insensitive dedupe; first-seen
 *     casing wins so MB's canonical capitalisation is preserved).
 *   - Spans are listed in begin-date order so a "left and rejoined"
 *     story reads chronologically (e.g. "1995–1998, 2010–").
 *   - Order of people is the order each one first appeared in the
 *     input, so MB's canonical ordering survives.
 */
function collapseMembers(entries: ArtistMember[]): CollapsedMember[] {
  const byId = new Map<string, CollapsedMember>();
  const seenAttrs = new Map<string, Set<string>>();
  for (const e of entries) {
    const id = e.artist.id;
    let row = byId.get(id);
    if (!row) {
      row = { artist: e.artist, attributes: [], spans: [] };
      byId.set(id, row);
      seenAttrs.set(id, new Set());
    }
    const attrSet = seenAttrs.get(id)!;
    for (const a of e.attributes ?? []) {
      const k = a.toLowerCase();
      if (!attrSet.has(k)) {
        attrSet.add(k);
        row.attributes.push(a);
      }
    }
    const span = formatSpan(e);
    if (span && !row.spans.includes(span)) row.spans.push(span);
  }
  // Sort each row's spans by begin year so "1995–1998, 2010–" reads
  // chronologically regardless of MB's relation order.
  for (const row of byId.values()) {
    row.spans.sort((a, b) => {
      const ya = parseInt(a.match(/\d{4}/)?.[0] ?? "0", 10);
      const yb = parseInt(b.match(/\d{4}/)?.[0] ?? "0", 10);
      return ya - yb;
    });
  }
  return Array.from(byId.values());
}

function MemberRow({ entry }: { entry: CollapsedMember }) {
  return (
    <li className="text-sm">
      <Link
        href={`/artist/${entry.artist.id}`}
        className="hover:underline"
      >
        {entry.artist.name}
      </Link>
      {entry.attributes.length > 0 && (
        <span className="text-muted-foreground/80 text-xs">
          {" · "}
          {entry.attributes.join(", ")}
        </span>
      )}
      {entry.spans.length > 0 && (
        <span className="text-muted-foreground/70 text-xs">
          {" "}({entry.spans.join(", ")})
        </span>
      )}
    </li>
  );
}

export function ArtistInfoSidebar({
  artist,
  /**
   * Pre-filtered Links list — when supplied, replaces the URLs derived
   * from the artist's relations. The artist page splits relations into
   * streaming / social / other categories and feeds only the "other"
   * subset here so the sidebar doesn't double up on what the hero row
   * and bio block already show.
   */
  linksOverride,
  /** Per-user top listeners from `getArtistListeners(mbid)`. */
  topListeners,
}: {
  artist: ArtistDetail;
  linksOverride?: ArtistExternalLink[];
  topListeners?: ArtistListeners["listeners"];
}) {
  const partitioned = partitionArtistRelations(artist);
  // Collapse repeated entries for the same person — MB models each
  // (artist, role, span) as its own relation, so multi-instrumentalists
  // and rejoined-the-band members get listed multiple times in the raw
  // data. We merge them so each person shows up exactly once with all
  // their roles + spans combined.
  const members = collapseMembers(partitioned.members);
  const memberOf = collapseMembers(partitioned.memberOf);
  const urls = linksOverride ?? partitioned.urls;
  const lifeBegin = artist["life-span"]?.begin;
  const lifeEnd = artist["life-span"]?.end;
  const ended = artist["life-span"]?.ended;
  const isGroup = artist.type === "Group" || artist.type === "Orchestra";
  const formedLabel = isGroup ? "Formed" : "Born";
  const dissolvedLabel = isGroup ? "Disbanded" : "Died";

  const beginArea = artist["begin-area"]?.name;
  const area = artist.area?.name;

  const primaryAliases = (artist.aliases ?? [])
    .filter((a) => a.name !== artist.name)
    .filter((a) => !a.type || a.type === "Artist name")
    .slice(0, 4)
    .map((a) => a.name);

  return (
    <aside className="space-y-8">
      <dl className="space-y-4">
        {lifeBegin && <Fact label={formedLabel}>{lifeBegin}</Fact>}
        {(lifeEnd || ended) && (
          <Fact label={dissolvedLabel}>{lifeEnd ?? "yes"}</Fact>
        )}
        {(beginArea || area) && (
          <Fact label={isGroup ? "From" : "Born in"}>
            {beginArea ?? area}
          </Fact>
        )}
        {primaryAliases.length > 0 && (
          <Fact label="Also known as">{primaryAliases.join(" · ")}</Fact>
        )}
      </dl>

      {members.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs tracking-wide uppercase text-muted-foreground">
            Members
          </h3>
          <ul className="space-y-1">
            {/* Plain mbid is unique now — collapseMembers() merges
                multiple stints for the same person into one row. */}
            {members.slice(0, 12).map((m) => (
              <MemberRow key={m.artist.id} entry={m} />
            ))}
          </ul>
        </div>
      )}

      {memberOf.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs tracking-wide uppercase text-muted-foreground">
            Member of
          </h3>
          <ul className="space-y-1">
            {memberOf.slice(0, 12).map((m) => (
              <MemberRow key={m.artist.id} entry={m} />
            ))}
          </ul>
        </div>
      )}

      {/* Other Links + the "+ Add sources" tile inline. The tile
          lands on MB's /edit page, which is the one path users need
          to add OR correct any of the links here — replaces the
          standalone "Edit on MusicBrainz" footer that used to live
          below the sidebar. */}
      <div>
        <h3 className="mb-2 text-xs tracking-wide uppercase text-muted-foreground">
          Other Links
        </h3>
        <ExternalLinks
          links={urls}
          addSources={{ mbEntity: "artist", mbid: artist.id }}
        />
      </div>

      {topListeners && topListeners.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs tracking-wide uppercase text-muted-foreground">
            Top listeners
          </h3>
          <TopListenersList listeners={topListeners} />
        </div>
      )}
    </aside>
  );
}
