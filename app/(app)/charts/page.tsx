import { redirect } from "next/navigation";

/** Bare /charts redirects to the Apple Music tab — the only chart we
 *  fully wire today. Spotify + College Radio sub-tabs ship as
 *  placeholders pending data sources. */
export default function ChartsIndex() {
  redirect("/charts/apple-music");
}
