import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  eyebrow?: ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 pt-8 pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8">
      <div className="min-w-0 space-y-3">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <Breadcrumbs items={breadcrumbs} />
        )}
        {eyebrow && (
          <p className="text-muted-foreground text-xs tracking-wide uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground max-w-2xl text-sm leading-6">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
