import type { Listen } from "@/lib/clients/listenbrainz";
import { ScrobbleRow } from "./scrobble-row";

export function ScrobbleList({ listens }: { listens: Listen[] }) {
  if (listens.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No listens yet.
      </p>
    );
  }
  return (
    <ul className="border-border/60 divide-border/60 divide-y rounded-xl border px-4">
      {listens.map((listen, i) => (
        <ScrobbleRow
          key={`${listen.listened_at}-${i}`}
          listen={listen}
        />
      ))}
    </ul>
  );
}
