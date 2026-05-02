"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
  /** Match this exactly (default true). Set false for parent-prefix matching. */
  exact?: boolean;
}

export function SectionTabs({
  tabs,
  className,
}: {
  tabs: SectionTab[];
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section tabs"
      className={cn(
        "border-border/60 -mx-4 overflow-x-auto border-b sm:-mx-6",
        className,
      )}
    >
      <ul className="flex min-w-max items-center gap-1 px-4 sm:px-6">
        {tabs.map((tab) => {
          const isActive =
            tab.exact === false
              ? pathname.startsWith(tab.href)
              : pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                className={cn(
                  "relative inline-flex h-10 items-center px-3 text-sm transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-3 -bottom-px h-0.5 rounded-t-full",
                    isActive ? "bg-foreground" : "bg-transparent",
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
