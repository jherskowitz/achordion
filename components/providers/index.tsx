import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      {/* SessionProvider lets the site header read auth state via the
          `useSession()` client hook instead of the server `auth()`
          call. That keeps the layout's SSR output identical for
          everyone (no auth fetch on render) so entity pages can be
          edge-cached for anonymous users — see DESIGN.md +
          AGENTS.md on the cache-vs-auth trade. Logged-in users see
          the anonymous header briefly during initial paint, then
          their avatar swaps in once useSession resolves. */}
      <SessionProvider>
        <QueryProvider>
          {/* One TooltipProvider for the whole app — Radix's per-portal
              tooltip content needs context, but spinning one up per
              tooltip is wasteful and breaks the shared open-delay
              "skipDelayDuration" handoff between adjacent triggers. */}
          <TooltipProvider>{children}</TooltipProvider>
        </QueryProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
