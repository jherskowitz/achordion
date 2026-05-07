import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

/**
 * Static-content layout (`#8`).
 *
 * The `(app)` group's layout calls `auth()` (to seed
 * `<LovedTracksProvider>`), which marks every page below it as
 * dynamic — costing the CDN-Cache-Control hint we set on
 * `/about` / `/faq` / `/donate` / `/apps` / `/changelog` in
 * `next.config.ts`. Those routes don't read auth state and don't
 * surface track UI, so the per-request server round-trip is pure
 * waste.
 *
 * This sibling group strips the layout down to its static minimum:
 * `<SiteHeader>` (already a client component that reads its own
 * session via `useSession()` post-hydration, so no `auth()` call is
 * needed at the layout level) plus `<SiteFooter>`. No
 * `<LovedTracksProvider>` because nothing inside this group
 * surfaces track-feedback UI.
 *
 * Page files inside the group set `export const revalidate = 86400`
 * to opt into static rendering. Combined with the existing
 * `PUBLIC_ENTITY_CACHE` `CDN-Cache-Control` header in
 * `next.config.ts`, that's the full edge-cached pipeline: each
 * static page renders once per 24h per Vercel edge, then serves
 * from cache.
 */
export default function ContentLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  );
}
