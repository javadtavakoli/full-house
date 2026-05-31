import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { AppNav } from "@/components/shell/app-nav";
import { OfflineBanner } from "@/components/shell/offline-banner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <OfflineBanner />
      <main className="flex-1">{children}</main>
    </div>
  );
}
