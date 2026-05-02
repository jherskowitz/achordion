import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth } from "@/auth";
import { ThemeRadio } from "@/components/achordion/theme-radio";
import { signOutAction } from "./actions";

export const metadata = { title: "Profile" };

export default async function SettingsProfilePage() {
  const session = await auth();
  if (!session?.user?.mbUsername) redirect("/login");

  const username = session.user.mbUsername;
  const displayName = session.user.name ?? username;
  const avatarUrl = session.user.image ?? undefined;

  return (
    <div className="space-y-10">
      <header>
        <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-muted-foreground mt-1 text-sm leading-6">
          Your MusicBrainz account is the identity behind Achordion.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="size-14">
            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
            <AvatarFallback className="text-lg">
              {username.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-base font-medium">{displayName}</p>
            <p className="text-muted-foreground text-sm">
              <Link
                href={`/user/${username}`}
                className="hover:text-foreground underline-offset-4 hover:underline"
              >
                @{username}
              </Link>
            </p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Theme</h3>
        <ThemeRadio />
        <p className="text-muted-foreground text-xs leading-5">
          Stored locally in your browser — not synced across devices.
        </p>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-medium">Account</h3>
        <form action={signOutAction}>
          <button
            type="submit"
            className="border-border/60 hover:bg-muted/40 inline-flex h-9 items-center rounded-lg border px-4 text-sm"
          >
            Sign out
          </button>
        </form>
      </section>
    </div>
  );
}
