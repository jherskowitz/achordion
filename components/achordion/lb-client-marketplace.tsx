import { ExternalLink, Sparkles } from "lucide-react";

interface LbClient {
  name: string;
  /**
   * Short freeform list — kept as strings so we don't ship 8 platform
   * icons. "Mac", "Windows", "Linux", "Android", "iOS", "Browser",
   * "Server", "CLI" are the typical buckets.
   */
  platforms: string[];
  blurb: string;
  url: string;
  /**
   * One line on what makes this app worth picking. Optional — set on the
   * featured app, dropped on the brief tiles.
   */
  highlight?: string;
}

const PARACHORD: LbClient = {
  name: "Parachord",
  platforms: ["Mac", "Windows", "Linux", "Android", "iOS"],
  blurb:
    "A cross-platform music player that scrobbles to ListenBrainz, plays from Spotify / Apple Music / SoundCloud / your local library, and matches every track to a MusicBrainz identity automatically.",
  url: "https://parachord.app",
  highlight:
    "Sister project to Achordion — they're built to feel like one product across desktop, mobile, and the web.",
};

const CLIENTS: LbClient[] = [
  {
    name: "Pano Scrobbler",
    platforms: ["Android"],
    blurb:
      "Open-source Android scrobbler that listens to any audio app on the device and posts to ListenBrainz, Last.fm, Libre.fm.",
    url: "https://github.com/kawaiiDango/pano-scrobbler",
  },
  {
    name: "Web Scrobbler",
    platforms: ["Browser"],
    blurb:
      "Browser extension that scrobbles plays from 100+ web players (Bandcamp, YouTube Music, Tidal, etc.).",
    url: "https://web-scrobbler.com",
  },
  {
    name: "Multi-Scrobbler",
    platforms: ["Server", "Docker"],
    blurb:
      "Self-hosted bridge that pulls from many sources (Spotify, Plex, Jellyfin, Subsonic, Mopidy) and writes to LB.",
    url: "https://github.com/FoxxMD/multi-scrobbler",
  },
  {
    name: "Symfonium",
    platforms: ["Android"],
    blurb:
      "Polished Android music player for Plex / Jellyfin / Subsonic with built-in ListenBrainz scrobbling.",
    url: "https://symfonium.app",
  },
  {
    name: "Strawberry",
    platforms: ["Mac", "Windows", "Linux"],
    blurb:
      "Desktop music player (Clementine fork) with native LB scrobbling for local libraries and streams.",
    url: "https://www.strawberrymusicplayer.org",
  },
  {
    name: "Funkwhale",
    platforms: ["Server", "Web"],
    blurb:
      "Federated, self-hosted music platform — scrobbles to LB and shares what you listen to with the fediverse.",
    url: "https://funkwhale.audio",
  },
  {
    name: "VLC + LB plugin",
    platforms: ["Mac", "Windows", "Linux"],
    blurb:
      "A community Lua plugin for VLC that scrobbles whatever you play — handy for old codecs and oddball formats.",
    url: "https://github.com/Serene-Arc/listenbrainz-vlc",
  },
  {
    name: "Mopidy",
    platforms: ["Linux", "Server"],
    blurb:
      "Headless music server (with mopidy-listenbrainz) — useful for Raspberry Pi setups and home audio.",
    url: "https://mopidy.com",
  },
];

function PlatformPills({ platforms }: { platforms: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {platforms.map((p) => (
        <span
          key={p}
          className="text-muted-foreground/80 bg-muted/50 rounded-full px-2 py-0.5 text-[10px] tracking-wide uppercase"
        >
          {p}
        </span>
      ))}
    </div>
  );
}

function FeaturedCard({ client }: { client: LbClient }) {
  return (
    <a
      href={client.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group from-primary/15 via-primary/8 to-background border-primary/30 hover:border-primary/50 relative block overflow-hidden rounded-2xl border bg-gradient-to-br p-6 transition-colors"
    >
      <span className="bg-primary text-primary-foreground absolute top-4 right-4 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
        <Sparkles className="size-2.5" />
        Featured
      </span>
      <h4 className="text-foreground text-lg font-semibold tracking-tight">
        {client.name}
      </h4>
      <div className="mt-2">
        <PlatformPills platforms={client.platforms} />
      </div>
      <p className="text-muted-foreground mt-3 max-w-prose text-sm leading-6">
        {client.blurb}
      </p>
      {client.highlight && (
        <p className="text-foreground/90 mt-3 max-w-prose text-sm leading-6">
          {client.highlight}
        </p>
      )}
      <span className="text-foreground/80 group-hover:text-foreground mt-4 inline-flex items-center gap-1 text-xs font-medium underline-offset-4 group-hover:underline">
        Visit {client.name}
        <ExternalLink className="size-3" />
      </span>
    </a>
  );
}

function ClientTile({ client }: { client: LbClient }) {
  return (
    <a
      href={client.url}
      target="_blank"
      rel="noopener noreferrer"
      className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group block rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="text-foreground text-sm font-medium">{client.name}</h4>
        <ExternalLink className="text-muted-foreground/60 group-hover:text-muted-foreground size-3 shrink-0" />
      </div>
      <div className="mt-2">
        <PlatformPills platforms={client.platforms} />
      </div>
      <p className="text-muted-foreground/80 mt-2 text-xs leading-5">
        {client.blurb}
      </p>
    </a>
  );
}

/**
 * Curated list of third-party ListenBrainz scrobblers and players.
 * Intentionally not exhaustive — we showcase Parachord prominently
 * (sister project, full-feature reference) and surface the rest as a
 * helpful "where else do people scrobble from" tour.
 */
export function LbClientMarketplace() {
  return (
    <section className="space-y-4">
      <header>
        <h3 className="text-sm font-medium">ListenBrainz scrobbler apps</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Don&apos;t see your music app in the list above? These third-party
          clients can scrobble straight to ListenBrainz, so anything you
          play through them shows up here automatically.
        </p>
      </header>
      <FeaturedCard client={PARACHORD} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {CLIENTS.map((c) => (
          <ClientTile key={c.name} client={c} />
        ))}
      </div>
    </section>
  );
}
