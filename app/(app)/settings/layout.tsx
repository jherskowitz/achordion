import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SettingsNav } from "@/components/achordion/settings-nav";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");
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
      <div className="grid grid-cols-1 gap-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside>
          <SettingsNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
