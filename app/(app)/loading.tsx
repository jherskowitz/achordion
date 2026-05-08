import { PageShell } from "@/components/achordion/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Group-level loading skeleton for every route under (app) that
 * doesn't define its own `loading.tsx`. Next.js shows this during
 * cross-page navigation while the destination page's RSC resolves;
 * without it, the user sees the previous page's content stick
 * around until the new page is fully rendered.
 *
 * The shape is deliberately generic — eyebrow + title + a list-or-
 * grid placeholder. Specific routes (artist / album / recording /
 * user / playlist) should ship their own `loading.tsx` if their
 * layout is distinctive enough that this stand-in feels jarring.
 */
export default function Loading() {
  return (
    <PageShell className="pt-8">
      <header className="mb-8 space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </header>
      <ul className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <li
            key={i}
            className="border-border/60 flex items-center gap-3 rounded-xl border p-3"
          >
            <Skeleton className="size-12 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-3 w-12 shrink-0" />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}
