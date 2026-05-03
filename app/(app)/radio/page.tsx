import { redirect } from "next/navigation";

/**
 * Bare /radio lands on the Radio Rewinds tab — most users come here
 * to browse curated stations rather than build their own. Anyone
 * looking for the LB Radio prompt builder picks "Station Builder" from
 * the sub-tabs.
 */
export default function RadioIndex() {
  redirect("/radio/rewind");
}
