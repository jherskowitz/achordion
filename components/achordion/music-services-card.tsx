"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

// LB hosts importer/scrobbler connections on two separate pages:
//  * Spotify lives on /profile/music-services/details/ (OAuth-based — LB
//    polls Spotify's recently-played API to backfill listens).
//  * Last.fm / Libre.fm live on /profile/import/ (one-shot history import
//    plus ongoing scrobble mirror).
//
// LB also exposes Apple Music, SoundCloud, and CritiqueBrainz on the
// music-services page, but those exist purely to power listenbrainz.org's
// in-browser player — they don't import listens from the source service,
// they only scrobble plays that happen *inside LB's player*. They have
// zero effect on Achordion users, so we omit them.
const LB_MUSIC_SERVICES_URL =
  "https://listenbrainz.org/profile/music-services/details/";
const LB_IMPORT_URL = "https://listenbrainz.org/profile/import/";

interface ServiceMeta {
  /** LB's internal service id (matches the anchor on the destination page). */
  id: string;
  name: string;
  blurb: string;
  manageUrl: string;
}

const SERVICES: ServiceMeta[] = [
  {
    id: "spotify",
    name: "Spotify",
    blurb:
      "Auto-import your Spotify listening history into ListenBrainz.",
    manageUrl: LB_MUSIC_SERVICES_URL,
  },
  {
    id: "lastfm",
    name: "Last.fm",
    blurb: "Mirror Last.fm scrobbles into ListenBrainz.",
    manageUrl: LB_IMPORT_URL,
  },
  {
    id: "librefm",
    name: "Libre.fm",
    blurb: "Mirror Libre.fm scrobbles into ListenBrainz.",
    manageUrl: LB_IMPORT_URL,
  },
];

/**
 * Pop-up size matches typical OAuth flow dimensions — wide enough for
 * the LB layout, tall enough that the consent screens (Spotify, Apple)
 * don't force scrolling.
 */
const POPUP_FEATURES = "popup=yes,width=560,height=760";

export function MusicServicesCard() {
  const popupRef = useRef<Window | null>(null);
  const router = useRouter();

  function open(target: string) {
    const url = target;

    // Reuse the same window if it's still open — keeps the user in one
    // pop-up across multiple "Connect" clicks instead of stacking them.
    const existing = popupRef.current;
    if (existing && !existing.closed) {
      existing.location.href = url;
      existing.focus();
      return;
    }

    const popup = window.open(url, "achordion-lb-services", POPUP_FEATURES);
    if (!popup) {
      // Pop-up blocked — fall back to a normal new-tab navigation.
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    popupRef.current = popup;

    // Cross-origin — we can't read LB's window contents, just observe
    // when it closes. On close, refresh the route so any LB-token-
    // derived UI on the page picks up newly-available data.
    const timer = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(timer);
        popupRef.current = null;
        router.refresh();
      }
    }, 500);
  }

  return (
    <section className="space-y-3">
      <header>
        <h3 className="text-sm font-medium">Scrobble imports</h3>
      </header>
      <p className="text-muted-foreground text-sm leading-6">
        Connect Spotify, Last.fm or Libre.fm so ListenBrainz keeps your
        listening history in sync. Connections are managed on
        ListenBrainz; we open it in a pop-up so you don&apos;t lose your
        place here.
      </p>
      <ul className="border-border/60 divide-border/60 divide-y rounded-xl border">
        {SERVICES.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-muted-foreground/80 truncate text-xs">
                {s.blurb}
              </p>
            </div>
            <button
              type="button"
              onClick={() => open(s.manageUrl)}
              className="text-muted-foreground hover:text-foreground border-border/60 hover:bg-muted/40 inline-flex h-7 shrink-0 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors"
            >
              Connect
              <ExternalLink className="size-3" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
