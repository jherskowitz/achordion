import { auth } from "@/auth";
import { getListenerArchetypes } from "@/lib/listener-archetypes";
import { isFeatureEnabled } from "@/lib/flags";
import { IconTooltip } from "@/components/ui/icon-tooltip";

/**
 * Listener-archetype chip strip on the profile header.
 *
 * Renders 0–3 small personality tags ("Night owl", "Same-thing-on-
 * repeat", "Discoverer", etc.) below the bio. Each chip carries a
 * `title` attribute with the underlying signal ("Top 100 tracks are
 * heavily skewed (Gini 0.71) — a few favourites dominate.") so a
 * hover reveals what the math says.
 *
 * Gates on its own `listener-archetypes` flag, separate from
 * `listener-bio`. The two surfaces share an underlying "computed
 * listening identity" theme but flip independently so you can
 * dogfood / kill-switch each without affecting the other (the
 * archetype thresholds are easier to mis-tune than the bio
 * composer, so they benefit from a faster kill lever).
 * Independent of bsky-link state too: archetypes apply regardless
 * of whether the user has a custom bsky bio, since they're a
 * structured trait set rather than free text.
 *
 * The renderer returns null when there are no qualifying archetypes
 * (cold users, ambivalent stats) so the slot is a no-op rather than
 * a "Mainstream listener · Habitual listener · Afternoon listener"
 * default-everything line that would dilute the signal of the
 * standout cases.
 */
export async function ListenerArchetypeChips({ name }: { name: string }) {
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  if (!(await isFeatureEnabled("listener-archetypes", viewer))) return null;

  const archetypes = await getListenerArchetypes(name);
  if (archetypes.length === 0) return null;

  // Render bare `<li>` elements (no outer `<ul>`) so the caller
  // can compose multiple chip sources into one shared list. The
  // parent decides spacing + wrapping; we just contribute items.
  // Each chip wraps its rich tooltip in `<IconTooltip>` for a
  // CSS-only hover/focus bubble — the native `title` attribute
  // is too slow + plain to do the explanation justice.
  return (
    <>
      {archetypes.map((a) => (
        <li key={a.id} className="inline-flex">
          <IconTooltip
            side="top"
            align="center"
            label={
              <span className="block max-w-[260px] whitespace-normal text-left text-xs leading-snug normal-case tracking-normal">
                <span className="block font-semibold">{a.label}</span>
                <span className="text-background/70 mt-0.5 block text-[11px] leading-4">
                  {a.why}
                </span>
              </span>
            }
            className={
              a.tone === "primary"
                ? "bg-primary/15 text-primary h-6 items-center rounded-full px-2.5 text-[11px] font-medium"
                : "bg-muted text-muted-foreground h-6 items-center rounded-full px-2.5 text-[11px] font-medium"
            }
          >
            {a.label}
          </IconTooltip>
        </li>
      ))}
    </>
  );
}
