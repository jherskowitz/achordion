import type { YearInMusicData } from "@/lib/clients/listenbrainz";

const DAY_OF_WEEK_LABEL: Record<string, string> = {
  Monday: "Mondays",
  Tuesday: "Tuesdays",
  Wednesday: "Wednesdays",
  Thursday: "Thursdays",
  Friday: "Fridays",
  Saturday: "Saturdays",
  Sunday: "Sundays",
};

function formatHours(seconds: number | undefined): string {
  if (!seconds) return "0";
  const hours = seconds / 3600;
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k`;
  return Math.round(hours).toLocaleString();
}

function n(v: number | undefined): string {
  return (v ?? 0).toLocaleString();
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="border-border/60 rounded-xl border p-4">
      <p className="text-muted-foreground/80 text-[11px] tracking-wide uppercase">
        {label}
      </p>
      <p className="text-foreground mt-1 text-2xl font-semibold tabular-nums">
        {value}
      </p>
      {hint && (
        <p className="text-muted-foreground/70 mt-0.5 text-[11px]">{hint}</p>
      )}
    </div>
  );
}

export function YearInMusicHero({
  data,
  year,
  username,
}: {
  data: YearInMusicData;
  year: number;
  username: string;
}) {
  const day = data.day_of_week ? DAY_OF_WEEK_LABEL[data.day_of_week] : null;
  return (
    <section>
      <p className="text-muted-foreground text-xs tracking-wide uppercase">
        {username} · {year}
      </p>
      <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
        Your year in music
      </h2>
      {day && (
        <p className="text-muted-foreground mt-2 text-sm">
          You listened most on{" "}
          <span className="text-foreground font-medium">{day}</span>.
        </p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total listens" value={n(data.total_listen_count)} />
        <Stat
          label="Hours listened"
          value={formatHours(data.total_listening_time)}
          hint="of music"
        />
        <Stat label="Artists" value={n(data.total_artists_count)} />
        <Stat
          label="Albums"
          value={n(data.total_release_groups_count)}
          hint="release groups"
        />
        <Stat
          label="New artists"
          value={n(data.total_new_artists_discovered)}
          hint="discovered"
        />
      </div>
    </section>
  );
}
