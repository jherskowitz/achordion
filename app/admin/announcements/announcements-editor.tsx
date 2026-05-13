"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2, Check, AlertCircle } from "lucide-react";
import type { Announcement } from "@/lib/announcements";
import { saveAnnouncements } from "../actions";

const SEVERITIES: Array<Announcement["severity"] & string> = [
  "info",
  "success",
  "warn",
  "error",
];

/**
 * Per-row form for one announcement. State lives in the parent
 * editor as an array; this component is a controlled view over one
 * entry. Save is whole-array, so each field mutation just patches
 * the local array.
 */
function AnnouncementRow({
  item,
  onChange,
  onDelete,
}: {
  item: Announcement;
  onChange: (next: Announcement) => void;
  onDelete: () => void;
}) {
  // Patches a single key on the announcement; "" collapses optional
  // fields to undefined so the schema's `.optional()` accepts the
  // result without falsy-string surprises on read.
  function patch<K extends keyof Announcement>(
    key: K,
    value: Announcement[K] | undefined,
  ) {
    const next = { ...item };
    if (value === undefined || value === "") {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  }

  function toggleSurface(s: "achordion" | "parachord") {
    const current = new Set(item.surfaces ?? []);
    if (current.has(s)) current.delete(s);
    else current.add(s);
    const arr = Array.from(current);
    patch("surfaces", arr.length === 0 ? undefined : arr);
  }

  const surfaces = item.surfaces ?? [];

  return (
    <li className="border-border/60 space-y-3 rounded-xl border p-4">
      <header className="flex items-baseline justify-between gap-2">
        <code className="text-muted-foreground text-xs">{item.id}</code>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive inline-flex items-center gap-1 text-xs"
          aria-label="Delete this announcement"
        >
          <Trash2 className="size-3" />
          Delete
        </button>
      </header>

      <Field label="ID (stable; dismissals key off this)">
        <input
          value={item.id}
          onChange={(e) => patch("id", e.target.value)}
          className={inputClass}
          spellCheck={false}
        />
      </Field>

      <Field label="Title">
        <input
          value={item.title}
          onChange={(e) => patch("title", e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="Body (optional, second line)">
        <textarea
          value={item.body ?? ""}
          onChange={(e) => patch("body", e.target.value || undefined)}
          rows={2}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Severity">
          <select
            value={item.severity ?? "info"}
            onChange={(e) =>
              patch(
                "severity",
                e.target.value as Announcement["severity"],
              )
            }
            className={inputClass}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Icon (emoji / glyph, ≤4 chars)">
          <input
            value={item.icon ?? ""}
            onChange={(e) => patch("icon", e.target.value || undefined)}
            maxLength={4}
            className={inputClass}
          />
        </Field>

        <Field label="CTA label (optional)">
          <input
            value={item.cta?.label ?? ""}
            onChange={(e) => {
              const label = e.target.value;
              if (!label) {
                patch("cta", undefined);
                return;
              }
              patch("cta", { label, url: item.cta?.url ?? "" });
            }}
            className={inputClass}
          />
        </Field>

        <Field label="CTA URL (optional, http/https)">
          <input
            value={item.cta?.url ?? ""}
            onChange={(e) => {
              const url = e.target.value;
              if (!url && !item.cta?.label) {
                patch("cta", undefined);
                return;
              }
              patch("cta", { label: item.cta?.label ?? "", url });
            }}
            className={inputClass}
            placeholder="https://"
          />
        </Field>

        <Field label="Expires at (ISO-8601, optional)">
          <input
            value={item.expiresAt ?? ""}
            onChange={(e) =>
              patch("expiresAt", e.target.value || undefined)
            }
            placeholder="2026-05-13T00:00:00Z"
            className={inputClass}
            spellCheck={false}
          />
        </Field>

        <Field label="Surfaces (omit to show on every surface)">
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={surfaces.includes("achordion")}
                onChange={() => toggleSurface("achordion")}
              />
              achordion
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={surfaces.includes("parachord")}
                onChange={() => toggleSurface("parachord")}
              />
              parachord
            </label>
          </div>
        </Field>
      </div>
    </li>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 block text-xs">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "border-border/60 bg-background placeholder:text-muted-foreground/60 focus:ring-ring/30 block w-full rounded-md border px-2.5 py-1.5 text-sm outline-none focus:ring-2";

/**
 * Top-level editor: holds the array state, renders one row per
 * announcement, exposes add / save. Save is whole-array — schema
 * validation happens server-side via `AnnouncementSchema.array()`.
 */
export function AnnouncementsEditor({
  initial,
}: {
  initial: Announcement[];
}) {
  const [items, setItems] = useState<Announcement[]>(initial);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "idle" }
    | { kind: "saved" }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  function addBlank() {
    const id = `note-${Date.now().toString(36)}`;
    setItems([
      ...items,
      { id, title: "New announcement", severity: "info" },
    ]);
  }

  function persist(next: Announcement[]) {
    setStatus({ kind: "idle" });
    startTransition(() => {
      saveAnnouncements(next)
        .then(() => setStatus({ kind: "saved" }))
        .catch((e: unknown) => {
          setStatus({
            kind: "error",
            message: e instanceof Error ? e.message : "Unknown error.",
          });
        });
    });
  }

  function save() {
    persist(items);
  }

  // Delete is a discrete, terminal action — auto-save so the row
  // disappears from Redis the moment the user clicks the trash icon.
  // Field edits stay batched behind the Save button (per-keystroke
  // writes would be wasteful + spammy), but deletion has no half-
  // state where you'd want to defer commit, and "click X → gone" is
  // the universal mental model. Without the auto-save here, a user
  // who clicked Delete + refreshed (without noticing the Save button
  // was still pending) would see the deleted row reappear, which
  // looks identical to a persistence bug.
  function deleteAt(index: number) {
    const next = items.filter((_, idx) => idx !== index);
    setItems(next);
    persist(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={addBlank}
          className="border-border/60 hover:bg-muted/40 inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs"
        >
          <Plus className="size-3.5" />
          Add announcement
        </button>
        <div className="flex items-center gap-2 text-xs">
          {status.kind === "saved" && (
            <span className="text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <Check className="size-3" />
              Saved
            </span>
          )}
          {status.kind === "error" && (
            <span className="text-destructive inline-flex items-center gap-1">
              <AlertCircle className="size-3" />
              {status.message}
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="bg-primary text-primary-foreground inline-flex h-8 items-center rounded-md px-3 text-xs font-medium hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground/80 rounded-xl border border-dashed border-border/60 py-8 text-center text-sm">
          No announcements. Click <em>Add announcement</em> to publish
          one, or just leave the list empty to clear the banner.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <AnnouncementRow
              key={i}
              item={item}
              onChange={(next) => {
                const copy = items.slice();
                copy[i] = next;
                setItems(copy);
              }}
              onDelete={() => deleteAt(i)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
