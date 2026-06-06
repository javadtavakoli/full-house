import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/session";
import { AppNav } from "@/components/shell/app-nav";
import { OfflineBanner } from "@/components/shell/offline-banner";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Room URLs are publicly reachable so voters can pick their identity.
// The page itself decides between picker (unauth) and room (auth).
const ROOM_PATH = /^\/app\/poker\/[0-9a-f-]{36}\/?$/;

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getServerUser();
  if (!user) {
    const h = await headers();
    const path = h.get("x-pathname") ?? "";
    if (!ROOM_PATH.test(path)) redirect("/login");
    // Unauth room visitor: render children (the page handles the picker) without nav.
    return <main className="min-h-screen">{children}</main>;
  }
  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />
      <OfflineBanner />
      <main className="flex-1">{children}</main>
    </div>
  );
}
