import { ExternalLink, Sparkles } from "lucide-react";

interface LbClient {
  name: string;
  /**
   * Short freeform list — kept as strings so we don't ship 8 platform
   * icons. "Mac", "Windows", "Linux", "Android", "iOS", "Browser",
   * "Server", "CLI", "Web" are the typical buckets.
   */
  platforms: string[];
  blurb: string;
  url: string;
  /**
   * One line on what makes this app worth picking. Optional — set on the
   * featured app, dropped on the brief tiles.
   */
  highlight?: string;
  /** Path under /public, e.g. "/apps/foo.jpg". Optional. */
  image?: string;
  /**
   * When true the tile gets a small "Featured" pill — used for picks
   * worth surfacing inside their category without promoting them out
   * to the big <FeaturedCard> at the top of the page.
   */
  featured?: boolean;
}

const PARACHORD: LbClient = {
  name: "Parachord",
  platforms: ["Mac", "Windows", "Linux", "Android", "iOS"],
  blurb:
    "A cross-platform music player that scrobbles to ListenBrainz, plays from Spotify / Apple Music / SoundCloud / your local library, and matches every track to a MusicBrainz identity automatically.",
  url: "https://parachord.com",
  highlight:
    "Sister project to Achordion — they're built to feel like one product across desktop, mobile, and the web.",
  image: "/parachord-hero.png",
};

interface ClientCategory {
  /** Section heading rendered above the tile grid. */
  title: string;
  /** Optional one-line lede. */
  blurb?: string;
  clients: LbClient[];
}

/**
 * Mirrors the categorisation on https://listenbrainz.org/add-data/ so
 * the two pages map onto each other intuitively. We keep a couple of
 * curated entries that LB doesn't list (Marvis Pro, NepTunes,
 * Symfonium) because they cover scrobble paths LB's directory misses.
 */
const CATEGORIES: ClientCategory[] = [
  {
    title: "Music players",
    clients: [
      {
        name: "Unstream",
        platforms: ["Mac", "Browser", "iOS"],
        blurb:
          "Menu-bar app and browser extensions that detect what you're listening to in Spotify, Apple Music, or your browser, scrobble it to ListenBrainz, and surface direct-from-artist purchase links across Bandcamp, Mirlo, Qobuz, Beatport, and 15+ other marketplaces.",
        url: "https://unstream.stream/",
        featured: true,
      },
      {
        name: "Ampcast",
        platforms: ["Web"],
        blurb:
          "A player, scrobbler and visualiser for personal media servers and streaming services.",
        url: "https://ampcast.app/",
      },
      {
        name: "Audacious",
        platforms: ["Linux", "Windows", "Mac"],
        blurb:
          "Cross-platform open source music player. Scrobbles to LB via the clscrobble plugin.",
        url: "https://audacious-media-player.org/",
      },
      {
        name: "Benben",
        platforms: ["Linux", "CLI"],
        blurb:
          "A command-line music player and converter for Unix-like operating systems.",
        url: "https://chiselapp.com/user/MistressRemilia/repository/benben",
      },
      {
        name: "Cider",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "Cross-platform Apple Music player. LB scrobbling via the official Cider plugin.",
        url: "https://github.com/ciderapp",
      },
      {
        name: "cmus",
        platforms: ["Linux", "Mac", "CLI"],
        blurb:
          "Console-based music player for Unix-like systems. LB scrobbling via cmus-status-scrobbler.",
        url: "https://cmus.github.io/",
      },
      {
        name: "Foobar2000",
        platforms: ["Windows"],
        blurb:
          "Full-fledged Windows music player. LB scrobbling via the foo_listenbrainz2 plugin.",
        url: "https://www.foobar2000.org/",
      },
      {
        name: "Lollypop",
        platforms: ["Linux"],
        blurb: "A modern music player for GNOME with built-in LB scrobbling.",
        url: "https://wiki.gnome.org/Apps/Lollypop",
      },
      {
        name: "Longplay",
        platforms: ["iOS", "Mac"],
        blurb: "An album-based music player for iOS and macOS.",
        url: "https://longplay.app/",
      },
      {
        name: "Marvis Pro",
        platforms: ["iOS", "iPadOS"],
        blurb:
          "Third-party Apple Music client for iOS / iPadOS with built-in Last.fm + ListenBrainz scrobbling — one of the few realistic Apple Music scrobble paths on iOS.",
        url: "https://apps.apple.com/app/marvis-pro/id1447768809",
      },
      {
        name: "mpd",
        platforms: ["Linux", "Server", "CLI"],
        blurb:
          "Cross-platform server-side music player. LB scrobbling via listenbrainz-mpd or wylt.",
        url: "https://www.musicpd.org/",
      },
      {
        name: "MPV",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "Cross-platform multimedia player. LB scrobbling via community Lua plugin.",
        url: "https://mpv.io/",
      },
      {
        name: "MusicBee",
        platforms: ["Windows"],
        blurb:
          "Music manager and player for Windows. LB scrobbling via the ScrobblerBrainz plugin.",
        url: "https://getmusicbee.com/",
      },
      {
        name: "Musium",
        platforms: ["Linux"],
        blurb: "An album-centered music player with native LB scrobbling.",
        url: "https://docs.ruuda.nl/musium/listenbrainz/",
      },
      {
        name: "NepTunes",
        platforms: ["Mac"],
        blurb:
          "Mac menu-bar app that scrobbles Apple Music and Spotify to ListenBrainz, Last.fm, and Libre.fm via system Now Playing APIs.",
        url: "https://apps.apple.com/us/app/neptunes/id1006739057",
      },
      {
        name: "Poweramp",
        platforms: ["Android"],
        blurb:
          "A music player for Android. LB scrobbling via the listenbrainz-poweramp plugin.",
        url: "https://powerampapp.com/",
      },
      {
        name: "Quod Libet",
        platforms: ["Mac", "Windows", "Linux"],
        blurb: "Cross-platform music player with LB scrobbling support.",
        url: "https://quodlibet.readthedocs.io/",
      },
      {
        name: "Rhythmbox",
        platforms: ["Linux"],
        blurb: "Music playing application for GNOME with LB scrobbling.",
        url: "https://wiki.gnome.org/Apps/Rhythmbox/",
      },
      {
        name: "Strawberry",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "Desktop music player (Clementine fork) with native LB scrobbling for local libraries and streams.",
        url: "https://www.strawberrymusicplayer.org",
      },
      {
        name: "Tauon Music Box",
        platforms: ["Linux", "Windows"],
        blurb: "A music player for Linux, Arch Linux, and Windows.",
        url: "https://tauonmusicbox.rocks/",
      },
      {
        name: "TIDAL Hi-Fi",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "The web version of Tidal running in Electron with Hi-Fi (High & Max) support.",
        url: "https://github.com/Mastermindzh/tidal-hifi",
      },
      {
        name: "TIDAL",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "Cross-platform music player and streaming service. LB scrobbling via the TidaLuna client mod + ListenBrainz plugin.",
        url: "https://tidal.com/",
      },
      {
        name: "VLC",
        platforms: ["Mac", "Windows", "Linux"],
        blurb:
          "Cross-platform multimedia player. LB scrobbling via the community VLC ListenBrainz plugin.",
        url: "https://www.videolan.org/vlc/",
      },
    ],
  },
  {
    title: "Servers & streaming",
    blurb:
      "Self-hosted streamers, bridges, and standalone scrobblers that run alongside other software.",
    clients: [
      {
        name: "Airsonic-Advanced",
        platforms: ["Server"],
        blurb: "A free, web-based media streamer with LB scrobbling.",
        url: "https://github.com/airsonic-advanced/airsonic-advanced",
      },
      {
        name: "AMWin-RP",
        platforms: ["Windows"],
        blurb:
          "Discord Rich Presence client for Apple Music's native Windows app, with LB scrobbling support.",
        url: "https://github.com/PKBeam/AMWin-RP",
      },
      {
        name: "applescript-listenbrainz",
        platforms: ["Mac"],
        blurb: "An AppleScript service that submits Apple Music listens to LB.",
        url: "https://github.com/golgote/applescript-listenbrainz",
      },
      {
        name: "AudioStreamerScrobbler",
        platforms: ["Server"],
        blurb:
          "Submit listens from hardware audiostreamers (Bluesound/BluOS, MusicCast, HEOS).",
        url: "https://github.com/vvdleun/audiostreamerscrobbler",
      },
      {
        name: "Eavesdrop.FM",
        platforms: ["Server"],
        blurb: "Submits Plex music listening data to ListenBrainz.",
        url: "https://github.com/simonxciv/eavesdrop.fm",
      },
      {
        name: "Funkwhale",
        platforms: ["Server", "Web"],
        blurb:
          "Federated, self-hosted music platform — scrobbles to LB and shares what you listen to with the fediverse.",
        url: "https://funkwhale.audio",
      },
      {
        name: "gonic",
        platforms: ["Server", "Linux"],
        blurb: "Free software Subsonic-compatible music server with LB scrobbling.",
        url: "https://github.com/sentriz/gonic",
      },
      {
        name: "Home Assistant",
        platforms: ["Server"],
        blurb:
          "Open-source home automation. ListenBrainz scrobbling via the Music Assistant plugin.",
        url: "https://www.home-assistant.io/",
      },
      {
        name: "Jellyfin",
        platforms: ["Server"],
        blurb:
          "Free software media streaming system. LB scrobbling via jellyfin-plugin-listenbrainz.",
        url: "https://jellyfin.org/",
      },
      {
        name: "Kodi",
        platforms: ["Mac", "Windows", "Linux", "Android"],
        blurb: "Free open-source media center. LB scrobbling via add-on.",
        url: "https://kodi.tv/",
      },
      {
        name: "Koito",
        platforms: ["Server"],
        blurb: "A self-hosted, themeable LB-compatible scrobbler.",
        url: "https://koito.io/",
      },
      {
        name: "Lyrion",
        platforms: ["Server"],
        blurb: "Open-source server software to control Squeezebox audio players.",
        url: "https://lyrion.org/",
      },
      {
        name: "Mopidy",
        platforms: ["Linux", "Server"],
        blurb:
          "Headless music server (with mopidy-listenbrainz) — useful for Raspberry Pi setups and home audio.",
        url: "https://mopidy.com",
      },
      {
        name: "mpris-scrobbler",
        platforms: ["Linux"],
        blurb: "Minimalistic Unix scrobbler for MPRIS-enabled players.",
        url: "https://github.com/mariusor/mpris-scrobbler",
      },
      {
        name: "Multi-Scrobbler",
        platforms: ["Server", "Docker"],
        blurb:
          "Self-hosted bridge that pulls from many sources (Spotify, Plex, Jellyfin, Subsonic, Mopidy) and writes to LB.",
        url: "https://github.com/FoxxMD/multi-scrobbler",
      },
      {
        name: "Navidrome",
        platforms: ["Server"],
        blurb:
          "Free software music server compatible with Subsonic/Airsonic, with LB scrobbling.",
        url: "https://www.navidrome.org/",
      },
      {
        name: "OngakuKiroku",
        platforms: ["Mac"],
        blurb:
          "ListenBrainz submitter for Swinsian and Music.app on macOS devices.",
        url: "https://github.com/Atelier-Shiori/OngakuKiroku",
      },
      {
        name: "Rescrobbled",
        platforms: ["Linux"],
        blurb: "Universal Linux scrobbler for MPRIS-enabled players.",
        url: "https://github.com/InputUsername/rescrobbled",
      },
      {
        name: "ScrobbleRadio",
        platforms: ["Web"],
        blurb:
          "Streaming radio player and listen submitter for a curated list of global radio stations.",
        url: "https://scrobblerad.io/",
      },
      {
        name: "SmashTunes",
        platforms: ["Mac"],
        blurb:
          "Mac menu-bar utility that displays the current track and submits Apple Music + Spotify listens.",
        url: "https://www.smashbits.nl/smashtunes/",
      },
    ],
  },
  {
    title: "Mobile",
    clients: [
      {
        name: "Official ListenBrainz app",
        platforms: ["Android"],
        blurb: "MetaBrainz's first-party Android app for ListenBrainz.",
        url: "https://play.google.com/store/apps/details?id=org.listenbrainz.android",
      },
      {
        name: "Pano Scrobbler",
        platforms: ["Android"],
        blurb:
          "Open-source Android scrobbler that listens to any audio app on the device and posts to ListenBrainz, Last.fm, Libre.fm.",
        url: "https://kawaiidango.github.io/pano-scrobbler/",
      },
      {
        name: "Symfonium",
        platforms: ["Android"],
        blurb:
          "Polished Android music player for Plex / Jellyfin / Subsonic with built-in ListenBrainz scrobbling.",
        url: "https://symfonium.app",
      },
      {
        name: "Booming Music",
        platforms: ["Android"],
        blurb:
          "A clean and fast Material You music player for Android with LB scrobbling.",
        url: "https://boomingmusic.vercel.app/",
      },
      {
        name: "Jewelcase",
        platforms: ["iOS"],
        blurb: "An offline music player for iOS with ListenBrainz scrobbling.",
        url: "https://www.jewelcase.app/",
      },
    ],
  },
  {
    title: "Browser extensions",
    clients: [
      {
        name: "Web Scrobbler",
        platforms: ["Browser"],
        blurb:
          "Browser extension that scrobbles plays from 100+ web players (Bandcamp, YouTube Music, Tidal, etc.).",
        url: "https://webscrobbler.com/",
      },
    ],
  },
  {
    title: "Scripts",
    blurb: "Pluck listens from less obvious sources.",
    clients: [
      {
        name: "phooks",
        platforms: ["CLI", "Server"],
        blurb:
          "Python script that submits local Plex listens using web hooks and file lookups.",
        url: "https://github.com/UnviableFriend/phooks",
      },
      {
        name: "ytm-extractor",
        platforms: ["CLI"],
        blurb:
          "Kotlin (Java) script to submit your YouTube Music watch history to ListenBrainz.",
        url: "https://github.com/defvs/ytm-extractor",
      },
      {
        name: "YTMusic2listenbrainz.py",
        platforms: ["CLI"],
        blurb:
          "Python script to submit your YouTube Music watch history to ListenBrainz.",
        url: "https://gist.github.com/fuddl/e17aa687df6ac1c7cbee5650ccfbc889",
      },
    ],
  },
  {
    title: "Playlist tools",
    blurb:
      "Submit, sync, or generate playlists against your ListenBrainz account.",
    clients: [
      {
        name: "listenbrainz-playlist-uploader",
        platforms: ["CLI"],
        blurb:
          "CLI tool for submitting local M3U playlists to ListenBrainz, plus track-feedback submission.",
        url: "https://github.com/Serene-Arc/listenbrainz-playlist-uploader",
      },
      {
        name: "ListenBrainz Tools (Infinity-Tools-SMP)",
        platforms: ["Windows"],
        blurb:
          "Foobar2000 plugin for submitting and retrieving ListenBrainz playlists, recommendations, and feedback.",
        url: "https://github.com/regorxxx/Infinity-Tools-SMP",
      },
      {
        name: "Playlist-Manager-SMP",
        platforms: ["Windows"],
        blurb:
          "Foobar2000 plugin for syncing local playlists with ListenBrainz (and Spotify), with local-content + YouTube link resolution.",
        url: "https://github.com/regorxxx/Playlist-Manager-SMP",
      },
      {
        name: "ListenBrainz macOS Scrobbler for Music.app",
        platforms: ["Mac", "CLI"],
        blurb: "macOS Bash script to submit Music.app listens to ListenBrainz.",
        url: "https://codeberg.org/scaglio/listenbrainz-scrobbler",
      },
      {
        name: "ListenBrainz Playlist Tool",
        platforms: ["Web"],
        blurb:
          "Standalone tool to select recent listens from a ListenBrainz account and add them to a ListenBrainz playlist.",
        url: "https://yogo9.github.io/listenbrainz-recent-listens-to-playlist/",
      },
    ],
  },
  {
    title: "Other tools",
    clients: [
      {
        name: "BrainzBot",
        platforms: ["Discord"],
        blurb:
          "Discord bot — share what you're listening to, charts, album grids, and tag clouds in any server.",
        url: "https://github.com/coopw1/BrainzBot",
      },
      {
        name: "Wrapped (Infinity-Tools-SMP)",
        platforms: ["Windows"],
        blurb:
          "Foobar2000 plugin that creates listening reports (Spotify-Wrapped-style) from ListenBrainz history for any time period.",
        url: "https://github.com/regorxxx/Infinity-Tools-SMP",
      },
    ],
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
      <span className="bg-primary text-primary-foreground absolute top-4 right-4 z-10 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-medium tracking-wide uppercase">
        <Sparkles className="size-2.5" />
        Featured
      </span>
      {client.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.image}
          alt={`${client.name} screenshot`}
          width={1512}
          height={927}
          className="border-border/40 mb-5 block w-full rounded-xl border"
        />
      )}
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
      className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group relative block overflow-hidden rounded-xl border p-4 transition-colors"
    >
      {client.featured && (
        // Inline featured pill — surfaces a curated pick inside its
        // category without promoting the tile out to the big
        // <FeaturedCard> shape (which is reserved for Parachord).
        <span className="bg-primary/90 text-primary-foreground absolute top-3 right-3 z-10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
          <Sparkles className="size-2.5" />
          Featured
        </span>
      )}
      {client.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={client.image}
          alt={`${client.name} screenshot`}
          width={1280}
          height={800}
          loading="lazy"
          className="border-border/40 mb-3 block aspect-[16/10] w-full rounded-lg border object-cover"
        />
      )}
      <div className="flex items-baseline justify-between gap-3">
        <h4
          className={cnTitle(client.featured)}
        >
          {client.name}
        </h4>
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
 * Reserve right-side space for the featured pill so a long name like
 * "ListenBrainz Tools (Infinity-Tools-SMP)" doesn't wrap underneath
 * it. Plain string concat — `cn()` would be overkill here.
 */
function cnTitle(featured: boolean | undefined): string {
  return featured
    ? "text-foreground pr-20 text-sm font-medium"
    : "text-foreground text-sm font-medium";
}

/**
 * Curated list of third-party ListenBrainz scrobblers and players.
 * Organised to mirror https://listenbrainz.org/add-data/ so the two
 * pages map onto each other — Parachord stays at the top as the
 * featured-card showcase, then categories in roughly the same order
 * LB uses (Music players, Servers & streaming, Mobile, Browser
 * extensions, Scripts, Playlist tools, Other tools).
 *
 * Caller is responsible for any introductory copy / page header —
 * this component renders only the featured card + categorised tile
 * grid so it can drop cleanly into /apps (where PageHeader provides
 * the title) and any future place that wants the same list.
 */
export function LbClientMarketplace() {
  return (
    <section className="space-y-10">
      <FeaturedCard client={PARACHORD} />
      {CATEGORIES.map((category) => (
        <div key={category.title} className="space-y-3">
          <header>
            <h3 className="text-foreground text-base font-semibold tracking-tight">
              {category.title}
            </h3>
            {category.blurb && (
              <p className="text-muted-foreground/80 mt-1 text-xs leading-5">
                {category.blurb}
              </p>
            )}
          </header>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {category.clients.map((c) => (
              <ClientTile key={c.url} client={c} />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
