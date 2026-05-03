/**
 * Strip HTML tags and collapse whitespace. Used for rendering LB-supplied
 * annotations / descriptions / notification messages as plain text — LB
 * frequently returns these with embedded `<p>`, `<a>`, etc. and we don't
 * want to ship a sanitizer just to render the body of a playlist blurb.
 *
 * Returns an empty string for null / undefined / empty input so callers
 * can use the result with truthy checks (`{annotation && ...}`).
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
