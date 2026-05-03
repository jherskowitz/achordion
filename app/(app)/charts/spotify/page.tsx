import { redirect } from "next/navigation";

/** Spotify charts (charts.spotify.com) is login-walled and ToS-bound;
 *  we replaced the tab with the ListenBrainz sitewide chart, which
 *  carries the open-data brand promise and gives us albums + songs
 *  with proper MBIDs out of the box. Old /charts/spotify URLs land
 *  here and forward to the new home for the same intent. */
export default function SpotifyChartsRedirect() {
  redirect("/charts/listenbrainz");
}
