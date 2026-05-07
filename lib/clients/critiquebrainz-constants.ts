/**
 * Pure constants shared between the CritiqueBrainz server client and
 * client UI components (e.g. the write-review form).
 *
 * Lives in its own file — without the `server-only` import that
 * `lib/clients/critiquebrainz.ts` carries — so client components can
 * import these limits without dragging the whole API client (and its
 * server-only boundary) into the browser bundle.
 */

/** CritiqueBrainz reviews must be ≥ 25 characters and ≤ 5000 to
 *  publish. We surface these as UI hints and re-validate server-
 *  side; the API will also reject out-of-bounds submissions with
 *  a 400. */
export const CB_REVIEW_MIN_CHARS = 25;
export const CB_REVIEW_MAX_CHARS = 5000;

/** Default Creative Commons license — CritiqueBrainz requires every
 *  review to declare one, and CC BY-SA 3.0 is the default the CB UI
 *  itself defaults to. */
export const CB_DEFAULT_LICENSE = "CC BY-SA 3.0";
