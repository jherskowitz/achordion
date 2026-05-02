import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
