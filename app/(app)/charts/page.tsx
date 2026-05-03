import { redirect } from "next/navigation";

/** Bare /charts redirects to the ListenBrainz tab — our open-data
 *  chart is the front-door default; Apple Music and College Radio
 *  remain available via the sub-tabs. */
export default function ChartsIndex() {
  redirect("/charts/listenbrainz");
}
