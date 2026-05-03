/**
 * Station metadata for the Radio Rewind cards. Mirrored from the
 * spinbin project at https://github.com/jherskowitz/spinbin — that repo
 * publishes a fresh XSPF per station every day at 5am EST via GitHub
 * Actions, and we just consume those URLs here. When spinbin adds a new
 * station, mirror the entry below; nothing else server-side needs to
 * change because the detail page renders any station id by URL.
 */

const SPINBIN_BASE =
  "https://jherskowitz.github.io/spinbin/playlists";

export interface SpinbinStation {
  /** URL-safe id used for /radio/rewind/[station]. Matches the XSPF filename's prefix. */
  id: string;
  name: string;
  /** Single-line locator: city + frequency, or "Internet only" / "Satellite", etc. */
  meta: string;
  blurb: string;
  /** Brand colour hex used for the card tile background. */
  color: string;
  /** Hosted XSPF URL — re-fetched on every detail-page load. */
  xspfUrl: string;
  /** Source-of-truth station page (Metacritic-style "info" link). */
  infoUrl: string;
}

export const SPINBIN_STATIONS: SpinbinStation[] = [
  {
    id: "kexp",
    name: "KEXP",
    meta: "Seattle, WA · 90.3 FM",
    blurb:
      "Where the music matters. The last 24 hours of plays from KEXP's public radio stream.",
    color: "#007A7A",
    xspfUrl: `${SPINBIN_BASE}/kexp-today.xspf`,
    infoUrl: "https://www.kexp.org/playlist/",
  },
  {
    id: "kcrw",
    name: "KCRW",
    meta: "Santa Monica, CA · 89.9 FM",
    blurb:
      "LA's independent public radio. Tracks from KCRW's Simulcast channel, updated daily.",
    color: "#E4002B",
    xspfUrl: `${SPINBIN_BASE}/kcrw-today.xspf`,
    infoUrl: "https://www.kcrw.com/playlists?channel=Simulcast",
  },
  {
    id: "wfmu",
    name: "WFMU",
    meta: "Jersey City, NJ · 91.1 FM",
    blurb:
      "Freeform radio from the longest-running freeform station in the US. Tracks from each show aired today.",
    color: "#111111",
    xspfUrl: `${SPINBIN_BASE}/wfmu-today.xspf`,
    infoUrl: "https://wfmu.org/playlists/",
  },
  {
    id: "wfuv",
    name: "WFUV",
    meta: "New York, NY · 90.7 FM",
    blurb:
      "Fordham University's public radio. Adult album alternative from the Bronx, now-playing feed.",
    color: "#003B71",
    xspfUrl: `${SPINBIN_BASE}/wfuv-today.xspf`,
    infoUrl: "https://wfuv.org/playlist",
  },
  {
    id: "somafm-groovesalad",
    name: "SomaFM Groove Salad",
    meta: "San Francisco, CA · Internet only",
    blurb:
      "A nicely chilled plate of ambient, downtempo, and beats. SomaFM's flagship channel.",
    color: "#5D3E8E",
    xspfUrl: `${SPINBIN_BASE}/somafm-groovesalad-today.xspf`,
    infoUrl: "https://somafm.com/groovesalad/",
  },
  {
    id: "somafm-indiepop",
    name: "SomaFM Indie Pop Rocks!",
    meta: "San Francisco, CA · Internet only",
    blurb:
      "New and classic indie pop tracks — jangly guitars, dreamy synths, and twee sensibilities on rotation.",
    color: "#E6408A",
    xspfUrl: `${SPINBIN_BASE}/somafm-indiepop-today.xspf`,
    infoUrl: "https://somafm.com/indiepop/",
  },
  {
    id: "xrayfm",
    name: "XRAY.fm",
    meta: "Portland, OR · 91.1 / 107.1 FM",
    blurb:
      "Community-powered independent radio from Portland. Eclectic programming with a deep record-collector sensibility.",
    color: "#E03A3E",
    xspfUrl: `${SPINBIN_BASE}/xrayfm-today.xspf`,
    infoUrl: "https://xray.fm/playlist",
  },
  {
    id: "vintageobscura",
    name: "Vintage Obscura",
    meta: "Internet · Curated by r/vintageobscura",
    blurb:
      "Hand-curated rare vintage tracks from around the world — psychedelia, synthpop, and obscurities from the '60s–'80s.",
    color: "#6B4423",
    xspfUrl: `${SPINBIN_BASE}/vintageobscura-today.xspf`,
    infoUrl: "https://vintageobscura.net/",
  },
  {
    id: "radioparadise",
    name: "Radio Paradise",
    meta: "Internet · Listener-supported",
    blurb:
      "Eclectic, hand-curated listener-supported internet radio. Commercial-free rock, world, blues, electronica — blended with taste.",
    color: "#0F3B5F",
    xspfUrl: `${SPINBIN_BASE}/radioparadise-today.xspf`,
    infoUrl: "https://radioparadise.com/",
  },
  {
    id: "nts",
    name: "NTS Radio",
    meta: "London, UK · 2 channels, 24/7",
    blurb:
      "The global tastemaker's choice. DJ-led shows from London, LA, Manchester and beyond — whatever the DJ submitted today.",
    color: "#000000",
    xspfUrl: `${SPINBIN_BASE}/nts-today.xspf`,
    infoUrl: "https://www.nts.live/",
  },
  {
    id: "wprb",
    name: "WPRB",
    meta: "Princeton, NJ · 103.3 FM",
    blurb:
      "Princeton University's legendary freeform station — one of the oldest in the US, with a reputation for adventurous programming.",
    color: "#FF6600",
    xspfUrl: `${SPINBIN_BASE}/wprb-today.xspf`,
    infoUrl: "https://spinitron.com/WPRB/",
  },
  {
    id: "kalx",
    name: "KALX",
    meta: "Berkeley, CA · 90.7 FM",
    blurb:
      "UC Berkeley's student-run station. Freeform across genres — noise, folk, jazz, punk — whatever the DJ brought.",
    color: "#003262",
    xspfUrl: `${SPINBIN_BASE}/kalx-today.xspf`,
    infoUrl: "https://spinitron.com/KALX/",
  },
  {
    id: "wmbr",
    name: "WMBR",
    meta: "Cambridge, MA · 88.1 FM",
    blurb:
      "MIT's student station — eclectic, educational, and eccentric in equal measure. Over 40 years of freeform radio.",
    color: "#A31F34",
    xspfUrl: `${SPINBIN_BASE}/wmbr-today.xspf`,
    infoUrl: "https://wmbr.org/",
  },
  {
    id: "bagelradio",
    name: "Bagel Radio",
    meta: "San Francisco, CA · Internet only",
    blurb:
      "Alternative rock for adults — new indie, shoegaze, post-punk, and the occasional deep cut. Independent and listener-supported.",
    color: "#8B6F47",
    xspfUrl: `${SPINBIN_BASE}/bagelradio-today.xspf`,
    infoUrl: "https://bagelradio.com/",
  },
  {
    id: "siriusxmu",
    name: "SiriusXMU",
    meta: "Satellite · Channel 35",
    blurb:
      "SiriusXM's indie/alternative channel — from the buzz bands to the underground, with deep cuts you won't hear on terrestrial radio.",
    color: "#1a1a1a",
    xspfUrl: `${SPINBIN_BASE}/siriusxmu-today.xspf`,
    infoUrl: "https://xmplaylist.com/station/siriusxmu",
  },
];

export function getSpinbinStation(id: string): SpinbinStation | null {
  return SPINBIN_STATIONS.find((s) => s.id === id) ?? null;
}
