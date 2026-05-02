import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ name: string }>;
}

export default async function CommunityIndex({ params }: PageProps) {
  const { name } = await params;
  redirect(`/user/${encodeURIComponent(name)}/community/followers`);
}
