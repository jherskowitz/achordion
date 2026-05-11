"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Tab-style nav link for the admin layout.
 *
 * Active state is computed against `usePathname()`:
 *   - `/admin` → active only on exact match (otherwise every
 *     subpage like `/admin/flags` would also count as Overview).
 *   - any other href → active when the pathname equals the href
 *     OR is a descendant (`href/...`), so future nested admin
 *     surfaces under `/admin/flags/...` still light up Feature
 *     Flags as their tab.
 *
 * The underline lives on the `<span>` inside the link rather than
 * on the link itself so its width matches the label text rather
 * than the link's padded hit area.
 */
export function AdminNavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const isActive =
    href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "rounded-md px-3 py-1.5 transition-colors",
        isActive
          ? "text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "inline-block",
          isActive &&
            "border-b-2 border-primary pb-0.5 -mb-0.5 font-medium",
        )}
      >
        {children}
      </span>
    </Link>
  );
}
