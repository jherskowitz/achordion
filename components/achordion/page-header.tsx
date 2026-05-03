import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  eyebrow?: ReactNode;
  /**
   * Optional content rendered to the left of the title block — used
   * by the artist page to slot in a hero avatar. Sized by the caller.
   */
  leading?: ReactNode;
  /**
   * Optional content rendered inside the title column, below the
   * description. Used by the artist page to slot the service-icon
   * row and the genre tags inline so they indent past the avatar
   * instead of starting flush at the page edge.
   */
  afterTitle?: ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  eyebrow,
  leading,
  afterTitle,
}: PageHeaderProps) {
  return (
    <header className="pt-8 pb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="mb-4">
          <Breadcrumbs items={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
        <div className="flex min-w-0 items-center gap-5">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="min-w-0 space-y-3">
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
            {afterTitle}
          </div>
        </div>
        {actions && (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
