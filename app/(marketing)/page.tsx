import type { Metadata } from "next";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Full House — sprint estimation for YouTrack teams",
  description: "Real-time Planning Poker tied to YouTrack: vote story points, estimate implementation/review/test, and sync back to your sprint.",
  alternates: { canonical: env.NEXT_PUBLIC_SITE_URL },
  openGraph: {
    title: "Full House",
    description: "Planning Poker for YouTrack teams.",
    url: env.NEXT_PUBLIC_SITE_URL,
    type: "website",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function Landing() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 flex flex-col gap-8">
      <h1 className="text-5xl font-bold">Full House</h1>
      <p className="text-xl text-muted-foreground">
        Sprint estimation tools that talk to YouTrack. Start with Planning Poker; more tools coming.
      </p>
      <div>
        <Button asChild size="lg"><Link href="/login">Get started</Link></Button>
      </div>
      <section className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Feature title="Real-time voting" body="Live presence, simultaneous reveal, revote when you need to discuss." />
        <Feature title="Three-phase duration" body="Estimate implementation, review and test separately. Skip any phase." />
        <Feature title="Writes back to YouTrack" body="Final SP and duration update the issue. A summary comment captures the room." />
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
