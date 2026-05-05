"use client";

import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import Link from "next/link";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

type Props = {
  /**
   * When true, renders `children` as-is (passthrough). When false, wraps
   * `children` in a Popover and intercepts the click so it pops the
   * "no token" nudge instead of firing the underlying action.
   */
  hasToken: boolean;
  /**
   * The clickable item that should pop the no-token nudge instead of firing.
   * Must be a single React element (e.g. a `<DropdownMenuItem>`); we clone it
   * to inject `onClick` (no-op) and `closeOnClick={false}` so the parent menu
   * stays open while the popover renders next to the item.
   */
  children: ReactNode;
  /** Where the popover anchors. Menu items default to "right". */
  side?: "right" | "top" | "bottom" | "left";
};

/**
 * Wraps a token-gated dropdown item with a Popover that nudges the
 * viewer to add their ListenBrainz token instead of letting the click
 * fall through to the underlying action (which would otherwise fire
 * the server action and surface a generic "Add your LB token" toast).
 *
 * Pass `hasToken={true}` to opt out — the wrapper becomes a no-op
 * passthrough so callers don't need to branch at every call site.
 */
export function NeedsTokenPopover({ hasToken, children, side = "right" }: Props) {
  if (hasToken) return <>{children}</>;
  if (!isValidElement(children)) return <>{children}</>;
  // Strip the original onClick and force the menu to stay open so the
  // popover (anchored to this item) has a stable visual frame. We also
  // swallow keyboard-select via the same handler.
  const child = cloneElement(
    children as ReactElement<{
      onClick?: (e: React.MouseEvent) => void;
      closeOnClick?: boolean;
      disabled?: boolean;
    }>,
    {
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
      },
      closeOnClick: false,
      // Override any `disabled` the underlying item set — we want the
      // click reachable so the popover can open and explain why.
      disabled: false,
    },
  );
  return (
    <Popover>
      <PopoverTrigger render={child} />
      <PopoverContent side={side} className="w-64">
        <p className="text-sm">
          You&rsquo;ll need to add your ListenBrainz token to do this.
        </p>
        <Button
          size="sm"
          className="self-start"
          render={<Link href="/settings/connections">Open settings →</Link>}
        />
      </PopoverContent>
    </Popover>
  );
}
