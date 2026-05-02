import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function MeRedirectPage() {
  const session = await auth();
  if (!session?.user?.mbUsername) {
    redirect("/login");
  }
  redirect(`/user/${session.user.mbUsername}`);
}
