import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
import type { WikipediaBio } from "@/lib/clients/wikipedia";
import { safeHttpUrl } from "./external-links";

export function Biography({
  bio,
  footer,
}: {
  bio: WikipediaBio;
  /**
   * Optional content rendered below the Wikipedia attribution — used
   * by the artist page to slot in the social-links favicon row inside
   * the same card the bio lives in.
   */
  footer?: ReactNode;
}) {
  // Wikipedia REST is trusted, but the bio.url field is still a
  // string — gate it behind the http(s)-only check so a future schema
  // change can't introduce a `javascript:` href.
  const safeBioUrl = safeHttpUrl(bio.url);
  return (
    <section className="border-border/60 bg-card/30 mb-6 rounded-xl border p-5">
      <p className="text-foreground max-w-3xl text-sm leading-7">
        {bio.extract}
      </p>
      {safeBioUrl && (
        <a
          href={safeBioUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1.5 text-xs"
        >
          <ExternalLink className="size-3" />
          Read on {bio.source}
        </a>
      )}
      {footer && (
        <div className="border-border/60 mt-4 border-t pt-4">{footer}</div>
      )}
    </section>
  );
}
