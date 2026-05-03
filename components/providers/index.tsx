import type { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryProvider>
        {/* One TooltipProvider for the whole app — Radix's per-portal
            tooltip content needs context, but spinning one up per
            tooltip is wasteful and breaks the shared open-delay
            "skipDelayDuration" handoff between adjacent triggers. */}
        <TooltipProvider>{children}</TooltipProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
