"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type TextareaHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

/**
 * Textarea that auto-completes `@username` tokens against the
 * viewer's LB following list.
 *
 * Behaviour:
 *   - On every keystroke, look back from the caret for the most
 *     recent `@…` token. If it parses, fire a prefix-match filter
 *     against the cached candidates list and pop a dropdown.
 *   - Up/Down arrows + Enter / Tab select; Esc dismisses. Click
 *     also selects. Selection replaces the `@partial` token with
 *     the full `@username ` (trailing space) and moves the caret
 *     to right after.
 *   - Candidates fetched lazily on first `@` trigger to avoid
 *     paying the LB round-trip when the user never tries to tag.
 *
 * Backed by `/api/me/following` (the viewer's LB following list).
 * Future: extend with followers / bsky-linked users.
 */

export interface MentionAutocompleteTextareaHandle {
  /** Focus the underlying textarea — same shape as a `<textarea>` ref. */
  focus: () => void;
}

interface Props
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onChange: (next: string) => void;
}

export const MentionAutocompleteTextarea = forwardRef<
  MentionAutocompleteTextareaHandle,
  Props
>(function MentionAutocompleteTextarea(
  { value, onChange, className, onKeyDown: parentOnKeyDown, ...rest },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
  }));

  // Candidates — fetched lazily the first time the user types `@`.
  // Keeps the dialog open fast for users who never tag anyone.
  const [candidates, setCandidates] = useState<string[] | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState(false);

  const ensureCandidatesLoaded = useCallback(async () => {
    if (candidates !== null || candidatesLoading) return;
    setCandidatesLoading(true);
    try {
      const r = await fetch("/api/me/following");
      if (r.ok) {
        const json = (await r.json()) as { following: string[] };
        setCandidates(json.following ?? []);
      } else {
        setCandidates([]);
      }
    } catch {
      setCandidates([]);
    } finally {
      setCandidatesLoading(false);
    }
  }, [candidates, candidatesLoading]);

  // Active mention-token state. `start` is the index *in the
  // current value* where the `@` sits; `query` is whatever the
  // user has typed after it (may be empty right after typing `@`).
  // `null` when no active mention.
  const [token, setToken] = useState<
    | { start: number; query: string }
    | null
  >(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection whenever the matching set could have changed.
  useEffect(() => {
    setSelectedIndex(0);
  }, [token?.query, candidates]);

  // Token-detection: look back from the caret for `@` preceded by a
  // word boundary, with only `[A-Za-z0-9._-]` between it and the
  // caret. Same character class the `parseMentions` regex uses on
  // the render side so suggestions and rendering stay aligned.
  function recomputeToken(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = /(?:^|[\s.,!?;:()[\]{}<>"'])@([A-Za-z0-9._-]{0,64})$/.exec(
      before,
    );
    if (!m) {
      setToken(null);
      return;
    }
    const query = m[1];
    // `start` here is the index of the `@` character itself.
    const atIdx = caret - query.length - 1;
    setToken({ start: atIdx, query });
    void ensureCandidatesLoaded();
  }

  function onChangeInternal(e: ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    recomputeToken(next, e.target.selectionStart);
  }

  function onSelectInternal() {
    // Caret moved without text changing (arrow keys, mouse click).
    // Re-evaluate whether the cursor is sitting inside a `@…` token.
    if (!textareaRef.current) return;
    recomputeToken(value, textareaRef.current.selectionStart);
  }

  const matches: string[] =
    token === null
      ? []
      : (candidates ?? [])
          .filter((u) =>
            u.toLowerCase().startsWith(token.query.toLowerCase()),
          )
          .slice(0, 6);

  function insertSelected() {
    if (!token) return;
    const username = matches[selectedIndex];
    if (!username) return;
    // Replace `@<query>` with `@<username> ` — keep the leading
    // `@` (it was part of the matched token).
    const head = value.slice(0, token.start);
    const tail = value.slice(token.start + 1 + token.query.length);
    const next = `${head}@${username} ${tail}`;
    onChange(next);
    setToken(null);
    // Restore focus + place caret right after the inserted space.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const caretAfter = token.start + 1 + username.length + 1;
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(caretAfter, caretAfter);
    });
  }

  function onKeyDownInternal(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (token !== null && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex(
          (i) => (i - 1 + matches.length) % matches.length,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertSelected();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setToken(null);
        return;
      }
    }
    parentOnKeyDown?.(e);
  }

  // Hide the dropdown when the textarea loses focus, but defer one
  // tick so a mousedown on the dropdown can fire `insertSelected`
  // before the blur tears it down. `onMouseDown` on the items also
  // calls `e.preventDefault()` to keep focus on the textarea.
  function onBlurInternal() {
    requestAnimationFrame(() => setToken(null));
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={onChangeInternal}
        onKeyDown={onKeyDownInternal}
        onSelect={onSelectInternal}
        onBlur={onBlurInternal}
        className={className}
        {...rest}
      />
      {token !== null && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Username suggestions"
          className="border-border/60 bg-popover absolute left-0 right-0 z-50 mt-1 max-h-48 overflow-y-auto rounded-md border py-1 shadow-md"
        >
          {matches.map((u, i) => (
            <li
              key={u}
              role="option"
              aria-selected={i === selectedIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                setSelectedIndex(i);
                // Defer one tick so the state update lands before
                // `insertSelected` reads `matches[selectedIndex]`.
                requestAnimationFrame(insertSelected);
              }}
              className={cn(
                "cursor-pointer px-3 py-1.5 text-sm",
                i === selectedIndex
                  ? "bg-muted text-foreground"
                  : "text-foreground/80 hover:bg-muted/50",
              )}
            >
              @{u}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});
