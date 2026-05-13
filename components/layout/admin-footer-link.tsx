"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

/**
 * Footer "Admin" link that's visible only to the site owner.
 *
 * Renders nothing for anyone else — including unauthenticated
 * visitors and signed-in users who aren't on the admin allowlist.
 * The allowlist is hardcoded in `lib/admin.ts` (server-only); we
 * mirror just the single owner username here so the client can
 * render the link without an extra round trip.
 *
 * The mirror is acceptable: an MB username isn't sensitive, and
 * the actual access gate sits server-side. This link just keeps
 * the entry point one click away from any page.
 */
const ADMIN_USERNAMES = new Set<string>(["jherskowitz"]);

export function AdminFooterLink() {
  const { data: session } = useSession();
  const username = session?.user?.mbUsername;
  if (!username || !ADMIN_USERNAMES.has(username.toLowerCase())) {
    return null;
  }
  return (
    <Link href="/admin" className="hover:text-foreground">
      Admin
    </Link>
  );
}
