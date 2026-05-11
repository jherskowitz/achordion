import { loadAllAnnouncements } from "@/lib/announcements";
import { AnnouncementsEditor } from "./announcements-editor";

export const metadata = { title: "Announcements · Admin" };

export const dynamic = "force-dynamic";

export default async function AnnouncementsAdminPage() {
  const initial = await loadAllAnnouncements();
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm leading-6">
        Edits replace the entire <code>announcements:json</code> array
        (admin Save writes the whole list, not individual rows). The
        site-wide banner picks the first non-dismissed entry and
        renders it within ~60 seconds of save. Items without
        <code> surfaces</code> show on every surface; scope to{" "}
        <code>[&quot;achordion&quot;]</code> for site-only or{" "}
        <code>[&quot;parachord&quot;]</code> to avoid the web banner.
      </p>
      <AnnouncementsEditor initial={initial} />
    </div>
  );
}
