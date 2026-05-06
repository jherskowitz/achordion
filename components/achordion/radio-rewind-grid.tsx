import Link from "next/link";
import { SPINBIN_STATIONS, type SpinbinStation } from "@/lib/spinbin-stations";
import { tileTextColor } from "@/lib/spinbin-tile";
import { stationLogoUrl } from "@/lib/spinbin-logo";
import { StationCover } from "./station-cover";

function StationCard({ station }: { station: SpinbinStation }) {
  const fg = tileTextColor(station.color);
  return (
    <Link
      href={`/radio/rewind/${encodeURIComponent(station.id)}`}
      className="border-border/60 hover:border-foreground/30 hover:bg-muted/30 group flex flex-col gap-3 rounded-2xl border p-4 transition-colors"
    >
      <StationCover
        name={station.name}
        color={station.color}
        textColor={fg}
        image={stationLogoUrl(station.id)}
        className="aspect-square w-full rounded-xl"
        textClassName="px-3 text-lg leading-tight"
      />
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
