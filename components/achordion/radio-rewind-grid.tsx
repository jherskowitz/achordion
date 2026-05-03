import Link from "next/link";
import { SPINBIN_STATIONS, type SpinbinStation } from "@/lib/spinbin-stations";

/**
 * Adjust the foreground colour for the brand tile so light/medium hues
 * (e.g. WPRB orange) get black text instead of white. Quick perceptual
 * luminance check — close enough for a 2-colour decision.
 */
function tileTextColor(hex: string): string {
  const m = hex.match(/^#?([a-f0-9]{6})$/i);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  // ITU-R BT.601 luma — fast, readable.
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62 ? "#111111" : "#ffffff";
}

function StationCard({ station }: { station: SpinbinStation }) {
  const fg = tileTextColor(station.color);
  return (
    <Link
      href={`/radio/rewind/${encodeURIComponent(station.id)}`}
      className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex flex-col gap-3 rounded-2xl border p-4 transition-colors"
    >
      <div
        className="flex aspect-square w-full items-center justify-center rounded-xl text-center font-semibold tracking-tight"
        style={{ backgroundColor: station.color, color: fg }}
        aria-hidden
      >
        <span className="px-3 text-lg leading-tight">{station.name}</span>
      </div>
      <div className="min-w-0 space-y-1">
        <p className="text-foreground text-sm font-medium tracking-tight">
          {station.name} Rewind
        </p>
        <p className="text-muted-foreground/80 text-xs">{station.meta}</p>
        <p className="text-muted-foreground/70 line-clamp-2 pt-1 text-xs leading-5">
          {station.blurb}
        </p>
      </div>
    </Link>
  );
}

export function RadioRewindGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {SPINBIN_STATIONS.map((s) => (
        <StationCard key={s.id} station={s} />
      ))}
    </div>
  );
}
