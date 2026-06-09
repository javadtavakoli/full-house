import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/trackpilot", label: "TrackPilot" },
  { href: "/ylate", label: "Ylate" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
            <Logo size={26} />
            Full House
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            {NAV.slice(1).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto">
            <Button asChild size="sm">
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="border-t">
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-6 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {2026} Full House — sprint estimation tools for YouTrack teams.</p>
          <nav className="flex gap-4">
            <Link href="/trackpilot" className="hover:text-foreground">
              TrackPilot
            </Link>
            <Link href="/ylate" className="hover:text-foreground">
              Ylate
            </Link>
            <Link href="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
