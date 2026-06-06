import type { Metadata } from "next";
import Link from "next/link";
import {
  Clock,
  ExternalLink,
  Layers,
  MousePointerClick,
  Pause,
  Play,
  Puzzle,
  Settings,
  Square,
} from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/marketing/code-block";
import { OsDownloads, type OsGroup } from "@/components/marketing/os-downloads";
import { Feature, FeatureGrid, JsonLd, Section, Step } from "@/components/marketing/page-parts";

const PAGE_URL = `${env.NEXT_PUBLIC_SITE_URL}/ylate`;
const GITHUB = "https://github.com/javadtavakoli/vscode-yt-timetracker";
const RELEASES_LATEST = `${GITHUB}/releases/latest`;
const MARKETPLACE = "https://marketplace.visualstudio.com/items?itemName=JavadTavakoli.ylate";

const DESKTOP_VERSION = "0.2.0";
const EXT_VERSION = "1.2.0";
const DL_BASE = `${GITHUB}/releases/download/desktop-v${DESKTOP_VERSION}`;

export const metadata: Metadata = {
  title: "Ylate — YouTrack time tracker",
  description:
    "A YouTrack time tracker with activity types and status-bar integration. Track time on your issues from VS Code or a native desktop app for Windows, macOS, and Linux.",
  keywords: [
    "Ylate",
    "YouTrack time tracker",
    "YouTrack timer",
    "VS Code time tracking",
    "YouTrack VS Code extension",
    "time tracking desktop app",
    "log work YouTrack",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Ylate — YouTrack time tracker for VS Code & desktop",
    description:
      "Track time on YouTrack issues with activity types and status-bar integration. VS Code extension + native desktop apps for Windows, macOS, and Linux.",
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ylate — YouTrack time tracker",
    description: "Track time on YouTrack issues from VS Code or the desktop.",
  },
  robots: { index: true, follow: true },
};

const DOWNLOADS: OsGroup[] = [
  {
    os: "windows",
    title: "Windows",
    assets: [
      { label: "Installer (.exe)", href: `${DL_BASE}/Ylate_${DESKTOP_VERSION}_x64-setup.exe`, hint: "x64" },
      { label: "MSI package", href: `${DL_BASE}/Ylate_${DESKTOP_VERSION}_x64_en-US.msi`, hint: "x64" },
    ],
  },
  {
    os: "mac",
    title: "macOS",
    assets: [
      { label: "Disk image (.dmg)", href: `${DL_BASE}/Ylate_${DESKTOP_VERSION}_universal.dmg`, hint: "universal" },
      { label: "App archive (.tar.gz)", href: `${DL_BASE}/Ylate_universal.app.tar.gz`, hint: "universal" },
    ],
  },
  {
    os: "linux",
    title: "Linux",
    assets: [
      { label: "AppImage", href: `${DL_BASE}/Ylate_${DESKTOP_VERSION}_amd64.AppImage`, hint: "amd64" },
      { label: "Debian (.deb)", href: `${DL_BASE}/Ylate_${DESKTOP_VERSION}_amd64.deb`, hint: "amd64" },
      { label: "RPM (.rpm)", href: `${DL_BASE}/Ylate-${DESKTOP_VERSION}-1.x86_64.rpm`, hint: "x86_64" },
    ],
  },
];

const COMMANDS = [
  { id: "ylate.configure", title: "Configure Connection" },
  { id: "ylate.refreshTasks", title: "Refresh Tasks" },
  { id: "ylate.pauseResume", title: "Pause / Resume Timer" },
  { id: "ylate.stopTimer", title: "Stop Timer" },
  { id: "ylate.startCustom", title: "Track Custom Task" },
  { id: "ylate.showPanel", title: "Open Tracker Panel" },
  { id: "ylate.statusBarMenu", title: "Status Bar Menu" },
];

const SETTINGS = [
  { key: "youtrackTracker.baseUrl", desc: "YouTrack base URL (e.g. https://yourcompany.youtrack.cloud)" },
  { key: "youtrackTracker.token", desc: "YouTrack permanent token" },
  { key: "youtrackTracker.projectId", desc: "YouTrack project short name (e.g. PROJ)" },
  { key: "youtrackTracker.myIssuesOnly", desc: "Show only issues assigned to me" },
];

const FAQ = [
  {
    q: "What is Ylate?",
    a: "Ylate is a YouTrack time tracker. It lets you start, pause, and stop timers on your assigned YouTrack issues with activity types and a status-bar display, then logs the time back to YouTrack. It ships as a VS Code extension and as native desktop apps.",
  },
  {
    q: "Which platforms does the desktop app support?",
    a: "Windows (.exe installer and .msi), macOS (universal .dmg and .app archive), and Linux (.AppImage, .deb, and .rpm).",
  },
  {
    q: "How do I connect Ylate to YouTrack?",
    a: "Create a permanent token in YouTrack, then set youtrackTracker.baseUrl, youtrackTracker.token, and youtrackTracker.projectId — or run the “Ylate: Configure Connection” command, which walks you through it.",
  },
  {
    q: "Is Ylate free and open source?",
    a: "Yes. Ylate is MIT-licensed and developed in the open on GitHub.",
  },
];

export default function YlatePage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Ylate",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, macOS, Linux",
    description:
      "A YouTrack time tracker with activity types, column management, and status-bar integration. Available as a VS Code extension and native desktop apps.",
    url: PAGE_URL,
    downloadUrl: RELEASES_LATEST,
    softwareVersion: DESKTOP_VERSION,
    license: "https://opensource.org/licenses/MIT",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: "Javad Tavakoli" },
  };
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 flex flex-col gap-16">
      <JsonLd data={[softwareJsonLd, faqJsonLd]} />

      {/* Hero */}
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Clock className="size-3.5" /> Time tracker
          </Badge>
          <Badge variant="outline">Desktop v{DESKTOP_VERSION}</Badge>
          <Badge variant="outline">VS Code v{EXT_VERSION}</Badge>
          <Badge variant="outline">MIT</Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Ylate</h1>
        <p className="text-xl text-muted-foreground">
          A YouTrack time tracker. Start, pause, and stop timers on your assigned issues with
          activity types, column management, and status-bar integration — then log the time straight
          back to YouTrack. Use it inside VS Code or as a native desktop app.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#download">Download desktop app</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={MARKETPLACE} target="_blank" rel="noopener noreferrer">
              VS Code extension <ExternalLink className="size-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">
              GitHub <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      {/* Features */}
      <Section title="What Ylate does">
        <FeatureGrid>
          <Feature icon={Play} title="One-click timers">
            Start, pause, resume, and stop a timer on any of your assigned YouTrack issues.
          </Feature>
          <Feature icon={Layers} title="Activity types">
            Tag tracked time with the right activity type so it lands in the correct bucket in
            YouTrack.
          </Feature>
          <Feature icon={MousePointerClick} title="Status-bar integration">
            See the running task and elapsed time at a glance, and control the timer from the status
            bar.
          </Feature>
          <Feature icon={Settings} title="Column management">
            Organize and focus the task list — show only the issues assigned to you.
          </Feature>
          <Feature icon={Square} title="Custom tasks">
            Track ad-hoc work that isn&rsquo;t tied to a specific issue with a custom task timer.
          </Feature>
          <Feature icon={Puzzle} title="Two surfaces">
            The same tracker as a VS Code extension or a standalone desktop app for Windows, macOS,
            and Linux.
          </Feature>
        </FeatureGrid>
      </Section>

      {/* Desktop download */}
      <Section
        id="download"
        title="Download the desktop app"
        description="Native builds for your platform. We highlight the download that matches your OS — all options are listed."
      >
        <OsDownloads groups={DOWNLOADS} />
        <p className="text-sm text-muted-foreground">
          Showing the latest desktop release, v{DESKTOP_VERSION}. Older builds and checksums are on
          the{" "}
          <a className="underline" href={RELEASES_LATEST} target="_blank" rel="noopener noreferrer">
            releases page
          </a>
          .
        </p>
      </Section>

      {/* VS Code install */}
      <Section
        title="Or install the VS Code extension"
        description="Prefer to track time without leaving your editor? Install Ylate from the Marketplace."
      >
        <div className="grid grid-cols-1 gap-4">
          <Step n={1} title="Install from the Marketplace">
            <p>
              Open the Extensions view in VS Code, search for <strong>Ylate</strong>, and install{" "}
              <code className="text-foreground">JavadTavakoli.ylate</code> — or install from the
              command line:
            </p>
            <CodeBlock language="bash" code="code --install-extension JavadTavakoli.ylate" />
          </Step>
          <Step n={2} title="Open the tracker">
            <p>
              Run <strong>Ylate: Open Tracker Panel</strong> from the Command Palette
              (<code className="text-foreground">Ctrl/Cmd + Shift + P</code>), or use the status-bar
              control.
            </p>
          </Step>
        </div>
        <p className="text-sm text-muted-foreground">
          <a className="underline" href={MARKETPLACE} target="_blank" rel="noopener noreferrer">
            View Ylate on the VS Code Marketplace
          </a>
        </p>
      </Section>

      {/* YouTrack setup */}
      <Section
        title="Connect to YouTrack"
        description="Create a permanent token in YouTrack (Profile → Account Security → Authentication → New token), then configure Ylate."
      >
        <div className="grid grid-cols-1 gap-4">
          <Step n={1} title="Run the guided setup">
            <p>
              The fastest path: run <strong>Ylate: Configure Connection</strong>
              (<code className="text-foreground">ylate.configure</code>) and follow the prompts.
            </p>
          </Step>
          <Step n={2} title="Or set the settings directly">
            <p>Configure these keys in VS Code settings (or the desktop app&rsquo;s settings):</p>
            <div className="flex flex-col gap-2">
              {SETTINGS.map((s) => (
                <div key={s.key} className="rounded-md border p-3">
                  <code className="text-sm font-semibold">{s.key}</code>
                  <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
                </div>
              ))}
            </div>
          </Step>
          <Step n={3} title="Start tracking">
            <p>
              Pick an issue, hit start, and Ylate logs the time back to YouTrack with the activity
              type you choose. Pause and resume from the status bar; stop to finalize the work item.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Play className="size-4" /> Start</span>
              <span className="inline-flex items-center gap-1"><Pause className="size-4" /> Pause / Resume</span>
              <span className="inline-flex items-center gap-1"><Square className="size-4" /> Stop</span>
            </div>
          </Step>
        </div>
      </Section>

      {/* Commands */}
      <Section
        title="Commands"
        description="Available from the Command Palette and the status-bar menu."
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {COMMANDS.map((c) => (
            <div key={c.id} className="flex flex-col gap-0.5 rounded-md border p-3">
              <span className="text-sm font-medium">{c.title}</span>
              <code className="text-xs text-muted-foreground">{c.id}</code>
            </div>
          ))}
        </div>
      </Section>

      {/* FAQ */}
      <Section title="FAQ">
        <div className="flex flex-col gap-5">
          {FAQ.map((f) => (
            <div key={f.q} className="flex flex-col gap-1.5">
              <h3 className="font-semibold">{f.q}</h3>
              <p className="text-sm text-muted-foreground">{f.a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Footer links */}
      <section className="flex flex-wrap gap-4 border-t pt-8 text-sm">
        <a className="inline-flex items-center gap-1 hover:underline" href={GITHUB} target="_blank" rel="noopener noreferrer">
          GitHub repository <ExternalLink className="size-3.5" />
        </a>
        <a className="inline-flex items-center gap-1 hover:underline" href={MARKETPLACE} target="_blank" rel="noopener noreferrer">
          VS Code Marketplace <ExternalLink className="size-3.5" />
        </a>
        <a className="inline-flex items-center gap-1 hover:underline" href={RELEASES_LATEST} target="_blank" rel="noopener noreferrer">
          All releases <ExternalLink className="size-3.5" />
        </a>
        <Link className="inline-flex items-center gap-1 hover:underline" href="/trackpilot">
          See also: TrackPilot
        </Link>
      </section>
    </main>
  );
}
