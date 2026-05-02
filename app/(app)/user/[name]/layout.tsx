import type { ReactNode } from "react";
import { UserPageHeader } from "@/components/achordion/user-page-header";

export default async function UserLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <>
      <UserPageHeader name={name} />
      {children}
    </>
  );
}
