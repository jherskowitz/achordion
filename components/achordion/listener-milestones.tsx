import { auth } from "@/auth";
import { getListenerMilestones } from "@/lib/listener-milestones";
import { isFeatureEnabled } from "@/lib/flags";
import { IconTooltip } from "@/components/ui/icon-tooltip";

/**
 * Listener-milestone chip strip on the profile header.
 *
 * Quantitative companion to <ListenerArchetypeChips>. Each chip
 * carries one number — total plays, distinct artists, current
 * streak, listening-since year — at the same visual register as
 * the qualitative archetype chips. Both strips share the chip
 * styling vocabulary so the row reads as one coherent identity
 * band rather than two separate features.
 *
 * Gates on its own `listener-milestones` flag (independent of
 * `listener-bio` / `listener-archetypes` / `listener-fingerprint`)
 * so each computed-identity surface can be dogfooded / rolled out
 * separately. All four flags currently default off; flip
 * individually via /admin/flags.
 *
 * Returns null when no milestone clears its threshold (cold users
 * with <500 plays). Avoids a "5 plays · 12 artists" row that would
 * read as a brand-new-account stub rather than a personality.
 */
export async function ListenerMilestones({ name }: { name: string }) {
  const session = await auth();
  const viewer = session?.user?.mbUsername ?? null;
  if (!(await isFeatureEnabled("listener-milestones", viewer))) return null;

  const milestones = await getListenerMilestones(name);
  if (milestones.length === 0) return null;

  // Same composition contract as <ListenerArchetypeChips> — bare
  // `<li>` elements share the parent `<ul>` so both surfaces wrap
  // as one continuous chip row. Each chip carries an
  // `<IconTooltip>` with a rich hover-state explanation of the
  // underlying number, matching the archetype chips' treatment.
  return (
    <>
      {milestones.map((m) => (
        <li key={m.id} className="inline-flex">
          <IconTooltip
            side="top"
            align="center"
            label={
              <span className="block max-w-[260px] whitespace-normal text-left text-xs leading-snug normal-case tracking-normal">
                <span className="block font-semibold">{m.label}</span>
                <span className="text-background/70 mt-0.5 block text-[11px] leading-4">
                  {m.why}
                </span>
              </span>
            }
            className="border-border/60 bg-card/40 text-foreground/90 h-6 items-center rounded-full border px-2.5 text-[11px] font-medium"
          >
            {m.label}
          </IconTooltip>
        </li>
      ))}
    </>
  );
}
