import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { hasUserLbToken } from "@/lib/lb-token";

/**
 * Post-auth landing pad. When the signed-in user hasn't pasted an LB
 * token yet, route them through the first-run wizard at /welcome.
 * Otherwise drop them on their profile. Returning users with a token
 * cookie skip the wizard entirely.
 */
export default async function MeRedirectPage() {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    redirect("/login");
  }
  const tokenConfigured = await hasUserLbToken();
  if (!tokenConfigured) {
    redirect("/welcome");
  }
  redirect(`/user/${session.user.mbUsername}`);
}
