import { ExternalLink } from "lucide-react";
import type { WikipediaBio } from "@/lib/clients/wikipedia";

export function Biography({ bio }: { bio: WikipediaBio }) {
  return (
    <section className="border-border/60 bg-card/30 mb-6 rounded-xl border p-5">
      <p className="text-foreground max-w-3xl text-sm leading-7">
        {bio.extract}
      </p>
      <a
        href={bio.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-muted-foreground hover:text-foreground mt-3 inline-flex items-center gap-1.5 text-xs"
      >
        <ExternalLink className="size-3" />
        Read on {bio.source}
      </a>
    </section>
  );
}
