import { SECTIONS } from "@/lib/section-og";
import { renderSectionOg, OG_SIZE, OG_CONTENT_TYPE } from "@/app/_og-section";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = SECTIONS["charts/apple-music"].alt;

export default function Og() {
  return renderSectionOg(SECTIONS["charts/apple-music"]);
}
