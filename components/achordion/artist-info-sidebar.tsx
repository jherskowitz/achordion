import Link from "next/link";
import type {
  ArtistDetail,
  ArtistMember,
} from "@/lib/clients/musicbrainz";
import { partitionArtistRelations } from "@/lib/clients/musicbrainz";
import { ExternalLinks } from "./external-links";

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

function MemberRow({ entry }: { entry: ArtistMember }) {
  const date =
    entry.begin && entry.end
      ? `${entry.begin}–${entry.end}`
      : entry.begin
        ? entry.ended
          ? `${entry.begin}–`
          : `since ${entry.begin}`
        : null;
  return (
    <li className="text-sm">
      <Link
        href={`/artist/${entry.artist.id}`}
        className="hover:underline"
      >
        {entry.artist.name}
      </Link>
      {entry.attributes && entry.attributes.length > 0 && (
        <span className="text-muted-foreground/80 text-xs">
          {" · "}
          {entry.attributes.join(", ")}
        </span>
      )}
      {date && (
        <span className="text-muted-foreground/70 text-xs"> ({date})</span>
      )}
    </li>
  );
}

export function ArtistInfoSidebar({ artist }: { artist: ArtistDetail }) {
  const { members, memberOf, urls } = partitionArtistRelations(artist);
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

      {urls.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs tracking-wide uppercase text-muted-foreground">
            Links
          </h3>
          <ExternalLinks links={urls} />
        </div>
      )}
    </aside>
  );
}
