import type { ReactNode } from "react";
import { ThemeProvider } from "./theme-provider";
import { QueryProvider } from "./query-provider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryProvider>{children}</QueryProvider>
    </ThemeProvider>
  );
}
