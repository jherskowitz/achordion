import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SectionTabs, type SectionTab } from "./section-tabs";

function userTabs(name: string): SectionTab[] {
  return [
    { href: `/user/${name}`, label: "Overview" },
    { href: `/user/${name}/listens`, label: "Listens" },
    { href: `/user/${name}/stats`, label: "Stats" },
    { href: `/user/${name}/charts`, label: "Charts" },
    { href: `/user/${name}/playlists`, label: "Playlists" },
    { href: `/user/${name}/pins`, label: "Pins" },
    { href: `/user/${name}/taste`, label: "Taste" },
    { href: `/user/${name}/recommendations`, label: "Recommendations" },
    { href: `/user/${name}/feed`, label: "Feed" },
    { href: `/user/${name}/followers`, label: "Followers" },
    { href: `/user/${name}/following`, label: "Following" },
  ];
}

export function UserPageHeader({ name }: { name: string }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <header className="border-border/60 border-b">
      <div className="mx-auto max-w-7xl px-4 pt-10 pb-0 sm:px-6">
        <div className="flex items-center gap-4 pb-6 sm:gap-6">
          <Avatar className="size-16 sm:size-20">
            <AvatarFallback className="text-xl">{initial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              ListenBrainz user
            </p>
            <h1 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">
              {name}
            </h1>
          </div>
        </div>
        <SectionTabs tabs={userTabs(name)} />
      </div>
    </header>
  );
}
