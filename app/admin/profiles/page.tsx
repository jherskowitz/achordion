import Link from "next/link";
import { getMostViewedProfiles } from "@/lib/profile-views";
import { relativeFromNow } from "@/components/achordion/relative-time";

export const metadata = { title: "Profiles · Admin" };

export const dynamic = "force-dynamic";

export default async function ProfilesAdminPage() {
  const rows = await getMostViewedProfiles(100);

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-6">
        User profiles ranked by render count, counting{" "}
        <strong>signed-in viewers only</strong>. Anonymous traffic
        isn&rsquo;t recorded — it was almost entirely crawlers enumerating
        real ListenBrainz accounts (including long-dormant email/domain-named
        signups), which buried the real signal. Each render — including tab
        navigation within a profile, and someone landing on their own
        profile — counts once, so this is &ldquo;times rendered by a
        logged-in user,&rdquo; not unique visitors.
      </p>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No profile views recorded yet.
        </p>
      ) : (
        <div className="border-border/60 overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-muted-foreground text-xs tracking-wide uppercase">
              <tr>
                <th className="w-10 px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Profile</th>
                <th className="px-4 py-2 text-right font-medium">Views</th>
                <th className="px-4 py-2 text-right font-medium">
                  Last viewed
                </th>
              </tr>
            </thead>
            <tbody className="divide-border/60 divide-y">
              {rows.map((r, i) => (
                <tr key={r.name} className="hover:bg-muted/30">
                  <td className="text-muted-foreground px-4 py-2 tabular-nums">
                    {i + 1}
                  </td>
                  <td className="px-4 py-2">
                    <Link
                      href={`/user/${encodeURIComponent(r.name)}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.views.toLocaleString()}
                  </td>
                  <td className="text-muted-foreground px-4 py-2 text-right">
                    {r.lastViewedAt != null
                      ? relativeFromNow(r.lastViewedAt)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
