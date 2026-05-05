import Link from "next/link";
import { auth } from "@/auth";
import {
  getYearInMusic,
  type SimilarUser,
} from "@/lib/clients/listenbrainz";
import { PageShell } from "@/components/achordion/page-shell";
import { ComingSoon } from "@/components/achordion/coming-soon";
import { Button } from "@/components/ui/button";
import { TopArtistsList } from "@/components/achordion/top-artists-list";
import { TopTracksList } from "@/components/achordion/top-tracks-list";
import { TopAlbumsGrid } from "@/components/achordion/top-albums-grid";
import { SimilarUsersList } from "@/components/achordion/similar-users-list";
import { YearInMusicHero } from "@/components/achordion/year-in-music/hero";
import { YearCalendarHeatmap } from "@/components/achordion/year-in-music/calendar";
import { YearTopGenres } from "@/components/achordion/year-in-music/top-genres";
import { DecadesChart } from "@/components/achordion/year-in-music/decades-chart";
import { ArtistEvolutionChart } from "@/components/achordion/year-in-music/evolution-chart";
import { NewReleasesGrid } from "@/components/achordion/year-in-music/new-releases-grid";
import { YimPlaylistCard } from "@/components/achordion/year-in-music/yim-playlist-card";
import { YearPicker } from "@/components/achordion/year-in-music/year-picker";

export const metadata = { title: "Year in Music" };

interface PageParams {
  searchParams: Promise<{ year?: string }>;
}

const YIM_FIRST_YEAR = 2021;

function availableYears(): number[] {
  const now = new Date();
  // YIM is published a couple of months into the new year. Default to last
  // calendar year unless we're past March, then offer current year too.
  const lastFull = now.getMonth() >= 2 ? now.getFullYear() - 1 : now.getFullYear() - 1;
  const years: number[] = [];
  for (let y = lastFull; y >= YIM_FIRST_YEAR; y--) years.push(y);
  return years;
}

export default async function ExploreYearInMusicPage({ searchParams }: PageParams) {
  const session = await auth();
  const username = session?.user?.mbUsername ?? null;
  const sp = await searchParams;
  const years = availableYears();
  const requested = Number(sp.year);
  const year =
    Number.isFinite(requested) && years.includes(requested)
      ? requested
      : years[0];

  if (!username) {
    return (
      <PageShell className="pt-8">
        <ComingSoon
          title="Sign in for your Year in Music"
          description="ListenBrainz computes a yearly recap from your listen history — top artists, tracks, albums, listening calendar, and more."
          hint={
            <Button size="sm" nativeButton={false} render={<Link href="/login" />}>
              Continue with MusicBrainz
            </Button>
          }
        />
      </PageShell>
    );
  }

  const data = await getYearInMusic(username, year);

  if (!data) {
    return (
      <PageShell className="pt-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight">Year in Music</h2>
          <YearPicker current={year} years={years} />
        </div>
        <ComingSoon
          title={`No Year in Music for ${year}`}
          description="ListenBrainz hasn't generated a recap for this year yet, or you didn't have enough listens. Try another year."
        />
      </PageShell>
    );
  }

  const similarUsers: SimilarUser[] = Object.entries(data.similar_users ?? {})
    .map(([user_name, similarity]) => ({ user_name, similarity }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 24);

  return (
    <PageShell className="pt-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <YearInMusicHero data={data} year={year} username={username} />
        </div>
        <div className="shrink-0">
          <YearPicker current={year} years={years} />
        </div>
      </div>

      <div className="space-y-12">
        <section>
          <SectionHeader title="Listening calendar" />
          <YearCalendarHeatmap year={year} days={data.listens_per_day ?? []} />
        </section>

        {data.artist_evolution_activity && data.artist_evolution_activity.length > 0 && (
          <section>
            <SectionHeader
              title="Top artists across the year"
              hint="Stacked monthly listens — top 5 artists."
            />
            <ArtistEvolutionChart rows={data.artist_evolution_activity} topN={5} />
          </section>
        )}

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <section>
            <SectionHeader title="Top genres" />
            <YearTopGenres genres={data.top_genres ?? []} limit={12} />
          </section>
          <section>
            <SectionHeader
              title="Most listened release decades"
              hint="When the music you played was first released."
            />
            {data.most_listened_year ? (
              <DecadesChart data={data.most_listened_year} mode="decade" />
            ) : (
              <p className="text-muted-foreground text-sm">
                No release-year data.
              </p>
            )}
          </section>
        </div>

        <section>
          <SectionHeader title="Top artists" />
          <TopArtistsList artists={data.top_artists ?? []} />
        </section>

        <section>
          <SectionHeader title="Top tracks" />
          <TopTracksList
            tracks={(data.top_recordings ?? []).map((r) => ({
              track_name: r.track_name ?? "Unknown track",
              recording_mbid: r.recording_mbid ?? null,
              artist_name: r.artist_name ?? "Unknown artist",
              artist_mbids: r.artist_mbids,
              release_name: r.release_name ?? null,
              release_mbid: r.release_mbid ?? null,
              listen_count: r.listen_count,
              caa_id: r.caa_id ?? null,
              caa_release_mbid: r.caa_release_mbid ?? null,
            }))}
          />
        </section>

        <section>
          <SectionHeader title="Top albums" />
          <TopAlbumsGrid albums={data.top_release_groups ?? []} />
        </section>

        {data.new_releases_of_top_artists && data.new_releases_of_top_artists.length > 0 && (
          <section>
            <SectionHeader
              title="New releases from your top artists"
              hint={`${data.new_releases_of_top_artists.length} albums dropped in ${year}.`}
            />
            <NewReleasesGrid releases={data.new_releases_of_top_artists} />
          </section>
        )}

        <section>
          <SectionHeader title="Year-end playlists" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <YimPlaylistCard
              playlist={data["playlist-top-discoveries-for-year"] ?? null}
              badge="Top discoveries"
            />
            <YimPlaylistCard
              playlist={data["playlist-top-missed-recordings-for-year"] ?? null}
              badge="Top missed"
            />
          </div>
        </section>

        {similarUsers.length > 0 && (
          <section>
            <SectionHeader
              title={`Similar listeners in ${year}`}
              hint="Users with the most overlap this year."
              seeAllHref="/explore/similar-users"
            />
            <SimilarUsersList users={similarUsers} layout="grid" />
          </section>
        )}
      </div>
    </PageShell>
  );
}

function SectionHeader({
  title,
  hint,
  seeAllHref,
}: {
  title: string;
  hint?: string;
  seeAllHref?: string;
}) {
  return (
    <header className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold tracking-wide uppercase">{title}</h2>
      <div className="flex items-baseline gap-3">
        {hint && (
          <p className="text-muted-foreground/70 hidden text-xs sm:block">
            {hint}
          </p>
        )}
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            See all →
          </Link>
        )}
      </div>
    </header>
  );
}
