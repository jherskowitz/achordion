import {
  Globe,
  Music,
  ExternalLink as ExternalIcon,
  type LucideIcon,
} from "lucide-react";
import type { ArtistExternalLink } from "@/lib/clients/musicbrainz";

interface IconRule {
  icon: LucideIcon;
  match: (link: ArtistExternalLink) => boolean;
  label: (link: ArtistExternalLink) => string;
}

const RULES: IconRule[] = [
  {
    icon: Globe,
    match: (l) =>
      l.type === "official homepage" ||
      l.url.includes("wikipedia.org") ||
      l.url.includes("wikidata.org"),
    label: (l) => {
      if (l.type === "official homepage") return "Official site";
      if (l.url.includes("wikipedia.org")) return "Wikipedia";
      if (l.url.includes("wikidata.org")) return "Wikidata";
      return l.type;
    },
  },
  {
    icon: Music,
    match: (l) =>
      l.url.includes("bandcamp.com") ||
      l.url.includes("soundcloud.com") ||
      l.url.includes("spotify.com") ||
      l.url.includes("music.apple.com") ||
      l.url.includes("youtube.com") ||
      l.url.includes("discogs.com"),
    label: (l) => {
      if (l.url.includes("bandcamp.com")) return "Bandcamp";
      if (l.url.includes("soundcloud.com")) return "SoundCloud";
      if (l.url.includes("spotify.com")) return "Spotify";
      if (l.url.includes("music.apple.com")) return "Apple Music";
      if (l.url.includes("youtube.com")) return "YouTube";
      if (l.url.includes("discogs.com")) return "Discogs";
      return l.type;
    },
  },
];

const PREFERRED_TYPES = new Set([
  "official homepage",
  "wikipedia",
  "wikidata",
  "bandcamp",
  "soundcloud",
  "youtube",
  "social network",
  "discogs",
  "lyrics",
  "free streaming",
  "streaming",
  "purchase for download",
]);

export function ExternalLinks({ links }: { links: ArtistExternalLink[] }) {
  // Dedupe by URL, then prioritize useful types and cap to keep the sidebar tidy
  const deduped = Array.from(
    new Map(links.map((l) => [l.url, l])).values(),
  );
  const sorted = deduped
    .slice()
    .sort((a, b) => {
      const ap = PREFERRED_TYPES.has(a.type) ? 0 : 1;
      const bp = PREFERRED_TYPES.has(b.type) ? 0 : 1;
      return ap - bp;
    })
    .slice(0, 8);

  if (sorted.length === 0) return null;

  return (
    <ul className="space-y-1.5">
      {sorted.map((link) => {
        const rule = RULES.find((r) => r.match(link));
        const Icon = rule?.icon ?? ExternalIcon;
        const label = rule?.label(link) ?? link.type.replace(/_/g, " ");
        return (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm"
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="capitalize">{label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
