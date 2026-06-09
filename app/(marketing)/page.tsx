import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight, Clock, Plug } from "lucide-react";

export const metadata: Metadata = {
  title: "Full House — sprint estimation for YouTrack teams",
  description:
    "Real-time Planning Poker tied to YouTrack: vote story points, estimate implementation/review/test, and sync back to your sprint. Plus TrackPilot (YouTrack MCP server & CLI) and Ylate (YouTrack time tracker).",
  alternates: { canonical: env.NEXT_PUBLIC_SITE_URL },
  openGraph: {
    title: "Full House",
    description: "Planning Poker, a YouTrack MCP server & CLI, and a time tracker — all for YouTrack teams.",
    url: env.NEXT_PUBLIC_SITE_URL,
    type: "website",
  },
  robots: { index: true, follow: true },
};

export default function Landing() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-24 flex flex-col gap-12">
      <div className="flex flex-col gap-8 max-w-3xl">
        <h1 className="text-5xl font-bold tracking-tight">Full House</h1>
        <p className="text-xl text-muted-foreground">
          Sprint estimation tools that talk to YouTrack. Start with Planning Poker, drive
          tickets from Claude or your terminal with TrackPilot, and track time with Ylate.
        </p>
        <div>
          <Button asChild size="lg">
            <Link href="/login">Get started</Link>
          </Button>
        </div>
      </div>

      <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Feature title="Real-time voting" body="Live presence, simultaneous reveal, revote when you need to discuss." />
        <Feature title="Three-phase duration" body="Estimate implementation, review and test separately. Skip any phase." />
        <Feature title="Writes back to YouTrack" body="Final SP and duration update the issue. A summary comment captures the room." />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">More tools for YouTrack</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ProductCard
            href="/trackpilot"
            icon={Plug}
            name="TrackPilot"
            tagline="An MCP server for YouTrack Cloud — also a CLI and ESM library."
            body="Let Claude read specs, create and update issues with full field support, dry-run commands, log work, and generate release diffs — or drive it yourself from the terminal or your code."
          />
          <ProductCard
            href="/ylate"
            icon={Clock}
            name="Ylate"
            tagline="A YouTrack time tracker for VS Code and the desktop."
            body="Start, pause and stop timers on your assigned issues with activity types and status-bar integration. Available as a VS Code extension and native desktop apps."
          />
        </div>
      </section>
    </main>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-2">{body}</p>
    </div>
  );
}

function ProductCard({
  href,
  icon: Icon,
  name,
  tagline,
  body,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  tagline: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-lg border p-6 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-5" />
        <h3 className="text-lg font-semibold">{name}</h3>
      </div>
      <p className="font-medium">{tagline}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium">
        Learn more
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
