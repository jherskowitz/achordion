import Link from "next/link";
import { parseMentions } from "@/lib/mentions";

/**
 * Render a free-text string (pin blurb, thanks message, etc.)
 * with `@username` tokens converted to profile links.
 *
 * Returns a Fragment of React nodes — wrap in your own `<p>` /
 * `<blockquote>` per surface so the typography stays
 * caller-controlled. The links inherit colour from the
 * surrounding type (`text-foreground hover:underline`); the
 * fallback colour matches the surrounding emphasis.
 */
export function MentionText({ text }: { text: string }) {
  const segments = parseMentions(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "text") return <span key={i}>{seg.value}</span>;
        return (
          <Link
            key={i}
            href={`/user/${encodeURIComponent(seg.name)}`}
            className="text-foreground underline underline-offset-2 hover:opacity-80"
          >
            @{seg.name}
          </Link>
        );
      })}
    </>
  );
}
