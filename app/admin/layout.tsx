import { notFound } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { PageShell } from "@/components/achordion/page-shell";
import { AdminNavLink } from "./admin-nav-link";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin route group.
 *
 * Auth-gates the entire subtree. Anyone who isn't on the admin
 * allowlist (hardcoded in `lib/admin.ts`) gets a 404 — admin
 * existence is unadvertised to non-admins (no /login redirect,
 * no "you must be signed in" prompt, no "you're signed in but
 * not authorized" message). 404 is what a non-existent URL
 * looks like.
 *
 * Admin pages share the site's regular chrome — `<SiteHeader>`
 * up top, `<SiteFooter>` at the bottom — so navigation back to
 * the public site is one click away and the layout reads as
 * "another tab of Achordion" rather than a different app.
 *
 * Pages under this layout assume `requireAdmin()` is enforced and
 * read/write Redis directly via server actions. No client-side
 * fetches for the admin surface — every action is a form-action
 * server function.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getAdminSession();
  if (!session?.isAdmin) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <PageShell className="pt-8">
          <header className="mb-6 flex items-baseline justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-xs tracking-wide uppercase">
                Admin
              </p>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Achordion controls
              </h1>
            </div>
            <p className="text-muted-foreground text-xs">
              Signed in as{" "}
              <span className="text-foreground">{session.username}</span>
            </p>
          </header>
          <nav className="mb-8 flex flex-wrap gap-1 text-sm">
            <AdminNavLink href="/admin">Overview</AdminNavLink>
            <AdminNavLink href="/admin/flags">Feature flags</AdminNavLink>
            <AdminNavLink href="/admin/announcements">Announcements</AdminNavLink>
            <AdminNavLink href="/admin/cache">Cache</AdminNavLink>
          </nav>
          {children}
        </PageShell>
      </main>
      <SiteFooter />
    </>
  );
}
