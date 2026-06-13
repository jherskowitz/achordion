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
        User profiles ranked by total render count. Each profile-page
        view — including tab navigation within a profile — counts once,
        so this is &ldquo;times rendered,&rdquo; not unique visitors.
        Someone landing on their own profile is included. Crawlers are
        challenged by Bot Protection, so these are mostly real views.
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
