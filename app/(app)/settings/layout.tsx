import type { ReactNode } from "react";
import { SettingsNav } from "@/components/achordion/settings-nav";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <header className="mb-10">
        <p className="text-muted-foreground mb-2 text-xs tracking-wide uppercase">
          Account
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Settings
        </h1>
      </header>
      <div className="grid gap-10 md:grid-cols-[200px_1fr]">
        <aside>
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
