import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminSession } from "@/lib/admin";
import { PageShell } from "@/components/achordion/page-shell";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin route group.
 *
 * Auth-gates the entire subtree. Anyone who isn't on the
 * `ADMIN_USERS` env allowlist gets a 404 — admin existence is
 * unadvertised to non-admins (no /login redirect, no "you must be
 * signed in" prompt, no "you're signed in but not authorized"
 * message). 404 is what a non-existent URL looks like.
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
          Signed in as <span className="text-foreground">{session.username}</span>
        </p>
      </header>
      <nav className="mb-8 flex flex-wrap gap-1 text-sm">
        <AdminNavLink href="/admin">Overview</AdminNavLink>
        <AdminNavLink href="/admin/flags">Feature flags</AdminNavLink>
        <AdminNavLink href="/admin/announcements">Announcements</AdminNavLink>
      </nav>
      {children}
    </PageShell>
  );
}

function AdminNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-muted-foreground hover:bg-muted/50 hover:text-foreground rounded-md px-3 py-1.5 transition-colors"
    >
      {children}
    </Link>
  );
}
