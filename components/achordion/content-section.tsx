import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Standard "uppercase eyebrow heading + flowing body" section used
 * inside content pages (/about, /faq, /donate, etc.). Pairs with
 * `<PageHeader>` at the page top — H1 lives there, this is for H2-
 * level grouping inside.
 *
 * `id` is optional but useful when the page has a TOC at the top
 * with anchor links (like /faq); pass it and the section will be a
 * scroll target with `scroll-mt-24` so the in-page jump doesn't
 * land underneath the sticky site header.
 *
 * Visual spec lives in DESIGN.md § Patterns → "Eyebrow → title →
 * description trio."
 */
export function ContentSection({
  id,
  title,
  children,
  className,
}: {
  id?: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn("space-y-3", id && "scroll-mt-24", className)}
    >
      <h2 className="text-sm font-semibold tracking-wide uppercase">
        {title}
      </h2>
      <div className="text-foreground/90 space-y-4 text-base leading-7">
        {children}
      </div>
    </section>
  );
}
