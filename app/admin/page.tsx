import Link from "next/link";

export default function AdminIndexPage() {
  return (
    <div className="space-y-6 text-sm leading-6">
      <p className="text-muted-foreground">
        Direct-write controls for the runtime levers that ship without
        a redeploy.
      </p>
      <ul className="space-y-3">
        <li>
          <Link
            href="/admin/flags"
            className="text-foreground hover:underline underline-offset-4"
          >
            Feature flags →
          </Link>
          <p className="text-muted-foreground text-xs">
            Toggle gated surfaces on / off for everyone or for a
            specific allowlist. Backs the same Redis keys
            (<code>flag:&lt;name&gt;:default</code> /{" "}
            <code>flag:&lt;name&gt;:users</code>) you&apos;d edit by
            hand via the Upstash console.
          </p>
        </li>
        <li>
          <Link
            href="/admin/announcements"
            className="text-foreground hover:underline underline-offset-4"
          >
            Announcements →
          </Link>
          <p className="text-muted-foreground text-xs">
            Publish / edit / clear the site-wide banner. Same JSON
            array Parachord-desktop reads — items can be scoped to a
            specific surface via the <code>surfaces</code> field.
          </p>
        </li>
      </ul>
    </div>
  );
}
