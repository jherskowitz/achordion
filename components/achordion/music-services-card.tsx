"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";

const LB_MUSIC_SERVICES_URL =
  "https://listenbrainz.org/profile/music-services/details/";

interface ServiceMeta {
  /** LB's internal service id (matches the anchor on the management page). */
  id: string;
  name: string;
  blurb: string;
}

const SERVICES: ServiceMeta[] = [
  {
    id: "spotify",
    name: "Spotify",
    blurb: "Auto-scrobble plays from Spotify into ListenBrainz.",
  },
  {
    id: "apple",
    name: "Apple Music",
    blurb: "Auto-scrobble plays from Apple Music.",
  },
  {
    id: "lastfm",
    name: "Last.fm",
    blurb: "Mirror Last.fm scrobbles into ListenBrainz.",
  },
  {
    id: "librefm",
    name: "Libre.fm",
    blurb: "Mirror Libre.fm scrobbles into ListenBrainz.",
  },
  {
    id: "soundcloud",
    name: "SoundCloud",
    blurb: "Auto-scrobble SoundCloud plays.",
  },
  {
    id: "critiquebrainz",
    name: "CritiqueBrainz",
    blurb: "Post album reviews from your listens.",
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

  function open(serviceId?: string) {
    const url = serviceId
      ? `${LB_MUSIC_SERVICES_URL}#${serviceId}`
      : LB_MUSIC_SERVICES_URL;

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
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Music services</h3>
        <button
          type="button"
          onClick={() => open()}
          className="bg-primary text-primary-foreground inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-opacity hover:opacity-90"
        >
          Manage on ListenBrainz
          <ExternalLink className="size-3" />
        </button>
      </header>
      <p className="text-muted-foreground text-sm leading-6">
        Connect Spotify, Apple Music, Last.fm and friends so ListenBrainz
        scrobbles your plays automatically. Connections are managed on
        ListenBrainz; we open it in a pop-up so you don&apos;t lose your
        place here.
      </p>
      <ul className="border-border/60 divide-border/60 divide-y rounded-xl border">
        {SERVICES.map((s) => (
          <li
            key={s.id}
            className="flex items-center gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-muted-foreground/80 truncate text-xs">
                {s.blurb}
              </p>
            </div>
            <button
              type="button"
              onClick={() => open(s.id)}
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
