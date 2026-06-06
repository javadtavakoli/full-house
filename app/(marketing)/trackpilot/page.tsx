import type { Metadata } from "next";
import Link from "next/link";
import {
  Bot,
  Boxes,
  Cpu,
  ExternalLink,
  FileJson,
  GitBranch,
  KeyRound,
  ListChecks,
  Plug,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { env } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/marketing/code-block";
import { CommandTabs } from "@/components/marketing/command-tabs";
import { Feature, FeatureGrid, JsonLd, Section, Step } from "@/components/marketing/page-parts";

const PAGE_URL = `${env.NEXT_PUBLIC_SITE_URL}/trackpilot`;
const GITHUB = "https://github.com/javadtavakoli/trackpilot";
const NPM = "https://www.npmjs.com/package/trackpilot";

export const metadata: Metadata = {
  title: "TrackPilot — AI-friendly YouTrack CLI",
  description:
    "An AI-friendly CLI and ESM library for YouTrack Cloud — read issues, create and update tasks, log work, and generate release diffs from your terminal, code, or Claude.",
  keywords: [
    "TrackPilot",
    "YouTrack CLI",
    "YouTrack API",
    "YouTrack library",
    "YouTrack automation",
    "AI YouTrack agent",
    "Claude YouTrack",
    "issue tracker CLI",
  ],
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "TrackPilot — AI-friendly YouTrack CLI & library",
    description:
      "Drive YouTrack Cloud from your terminal, your code, or an AI agent. JSON output, validation-before-write, OS-keyring token storage.",
    url: PAGE_URL,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "TrackPilot — AI-friendly YouTrack CLI & library",
    description: "Drive YouTrack Cloud from your terminal, your code, or Claude.",
  },
  robots: { index: true, follow: true },
};

const FAQ = [
  {
    q: "What is TrackPilot?",
    a: "TrackPilot is an AI-friendly CLI and importable ESM library for driving YouTrack Cloud. It reads issue specs, creates and updates tasks, comments, searches, logs work, and generates release diffs by extracting issue IDs from git history.",
  },
  {
    q: "How do I install TrackPilot?",
    a: "Run it without installing via npx trackpilot, pnpm dlx trackpilot, or yarn dlx trackpilot, or install it globally with npm i -g trackpilot. To use it as a library, add the trackpilot package to your project.",
  },
  {
    q: "Can I use TrackPilot with AI models like Claude?",
    a: "Yes. TrackPilot can run as a local MCP (Model Context Protocol) server with `trackpilot mcp`, exposing YouTrack read and write tools to clients like Claude Code and Claude Desktop. You can also point a coding agent at the JSON-returning CLI, or import the library and expose its methods as Claude API tools.",
  },
  {
    q: "Where are my YouTrack credentials stored?",
    a: "The CLI stores your token in the OS keyring (macOS Keychain, Windows Credential Manager, Linux Secret Service). The non-secret base URL lives in a local config file. In CI, pass credentials via environment variables.",
  },
];

const COMMANDS: { name: string; signature: string; desc: string; example: string }[] = [
  {
    name: "projects",
    signature: "trackpilot projects",
    desc: "List projects and their short-name keys.",
    example: "trackpilot projects",
  },
  {
    name: "read",
    signature: "trackpilot read <id>",
    desc: "Fetch a single issue with fields, comments, tags, and links.",
    example: "trackpilot read ABC-123",
  },
  {
    name: "list",
    signature: "trackpilot list --query <yt-query> [--limit N]",
    desc: "Search issues using YouTrack query syntax.",
    example: 'trackpilot list --query "project: ABC State: Open" --limit 20',
  },
  {
    name: "create",
    signature: "trackpilot create --project <KEY> --summary <text> [...]",
    desc: "Create a task in one operation. Fields, users, and tags are validated client-side before any write, with “did you mean” suggestions.",
    example: [
      "trackpilot create --project ABC --summary \"Release\" --type Task \\",
      "  --assignee \"Javad Tavakoli\" \\",
      "  --field \"Team=Front-End\" --field \"Estimation=1d\" \\",
      "  --tag scope:infra --relates ABC-211",
    ].join("\n"),
  },
  {
    name: "update",
    signature: "trackpilot update <id> [--state ...] [--field ...] [...]",
    desc: "Update an existing issue. Same flags as create; requires at least one.",
    example: 'trackpilot update ABC-123 --state "In Progress" --tag scope:infra',
  },
  {
    name: "comment",
    signature: "trackpilot comment <id> --text <text>",
    desc: "Add a comment to an issue.",
    example: 'trackpilot comment ABC-123 --text "Deployed to staging, ready for QA."',
  },
  {
    name: "fields",
    signature: "trackpilot fields <KEY>",
    desc: "List custom fields, allowed values, and tags for a project — useful for discovery.",
    example: "trackpilot fields ABC",
  },
  {
    name: "command",
    signature: "trackpilot command <id> --query <yt-command>",
    desc: "Apply an arbitrary YouTrack command (low-level escape hatch).",
    example: 'trackpilot command ABC-123 --query "State Fixed tag release-blocker"',
  },
  {
    name: "release",
    signature: "trackpilot release [--base main] [--head next]",
    desc: "Generate a QA-ready release report by scanning commits in base..head, extracting issue IDs, and resolving each one.",
    example: "trackpilot release --base main --head release/2.0",
  },
  {
    name: "mcp",
    signature: "trackpilot mcp",
    desc: "Run an MCP (Model Context Protocol) server over stdio, exposing YouTrack tools to clients like Claude. Uses the same auth as the CLI.",
    example: "trackpilot mcp",
  },
];

const LIBRARY_EXAMPLE = `import { createApi } from "trackpilot";

const yt = createApi({
  baseUrl: "https://example.youtrack.cloud",
  token: process.env.YOUTRACK_TOKEN,
});

const me = await yt.me();
const issues = await yt.search("for: me #Unresolved", 20);

await yt.createIssue({
  project: "ACME",
  summary: "Title",
  description: "Body (optional)",
});

await yt.applyCommand("ACME-1", "State {In Progress}");
await yt.addComment("ACME-1", "Picked up — starting now.");

await yt.logWorkItem("ACME-1", {
  minutes: 30,
  text: "Pairing",
  date: Date.now(),
  type: "Development",
});`;

const CLAUDE_MCP_CLI = `claude mcp add trackpilot -- npx trackpilot mcp`;

const CLAUDE_MCP_DESKTOP = `{
  "mcpServers": {
    "trackpilot": {
      "command": "npx",
      "args": ["trackpilot", "mcp"],
      "env": {
        "YOUTRACK_BASE_URL": "https://your.youtrack.cloud",
        "YOUTRACK_TOKEN": "perm-xxxxxxxx"
      }
    }
  }
}`;

const CLAUDE_CLI_PROMPT = `# Hand this to Claude Code (or any coding agent that can run a shell):

Use the \`trackpilot\` CLI to manage YouTrack. It returns JSON and
validates before writing, so parse stdout as JSON and never invent
field names — discover them first.

1. Read the parent spec:      trackpilot read ABC-1
2. Discover the project schema: trackpilot fields ABC
3. Draft subtasks, then for each one:
   trackpilot create --project ABC --summary "<title>" \\
     --description "<body>" --subtask-of ABC-1
4. Move the parent forward:    trackpilot update ABC-1 --state "In Progress"
5. At release time, summarize: trackpilot release --base main --head next`;

const CLAUDE_TOOLS_EXAMPLE = `import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createApi } from "trackpilot";

const yt = createApi({
  baseUrl: process.env.YT_BASE_URL!,
  token: process.env.YOUTRACK_TOKEN!,
});
const client = new Anthropic();

// Wrap TrackPilot library methods as Claude tools.
const searchIssues = betaZodTool({
  name: "search_issues",
  description: "Search YouTrack with its query syntax. Call this whenever the user asks about existing issues.",
  inputSchema: z.object({
    query: z.string().describe('e.g. "for: me #Unresolved"'),
    limit: z.number().optional(),
  }),
  run: ({ query, limit }) => yt.search(query, limit).then((r) => JSON.stringify(r)),
});

const createIssue = betaZodTool({
  name: "create_issue",
  description: "Create a YouTrack issue. Call this when the user asks to file or open a ticket.",
  inputSchema: z.object({
    project: z.string(),
    summary: z.string(),
    description: z.string().optional(),
  }),
  run: (input) => yt.createIssue(input).then((r) => JSON.stringify(r)),
});

// The tool runner drives the loop: Claude calls the tools, results feed back.
const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-4-8",
  max_tokens: 16000,
  tools: [searchIssues, createIssue],
  messages: [
    { role: "user", content: "File a bug in ACME: login button is unresponsive on Safari." },
  ],
});

console.log(finalMessage.content);`;

export default function TrackPilotPage() {
  const softwareJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "TrackPilot",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "macOS, Windows, Linux",
    description:
      "An AI-friendly CLI and importable ESM library for driving YouTrack Cloud: read issues, create and update tasks, log work, and generate release diffs.",
    url: PAGE_URL,
    downloadUrl: NPM,
    softwareVersion: "0.6.0",
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
            <Terminal className="size-3.5" /> CLI + library
          </Badge>
          <Badge variant="outline">v0.6.0</Badge>
          <Badge variant="outline">MIT</Badge>
          <Badge variant="outline">Node 20+</Badge>
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">TrackPilot</h1>
        <p className="text-xl text-muted-foreground">
          An AI-friendly CLI and importable ESM library for driving YouTrack Cloud. Read issue
          specs, create and update tasks, comment, search, log work, and generate release diffs —
          from your terminal, your code, or an AI agent like Claude.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="#install">Install</a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">
              GitHub <ExternalLink className="size-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href={NPM} target="_blank" rel="noopener noreferrer">
              npm <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </header>

      {/* Features */}
      <Section title="Why TrackPilot">
        <FeatureGrid>
          <Feature icon={Boxes} title="Dual interface">
            Use it as a command-line tool or import it as a JavaScript library — same capabilities,
            your choice of surface.
          </Feature>
          <Feature icon={FileJson} title="JSON everywhere">
            Every command returns JSON, readable by humans and trivially parseable by scripts and
            LLMs.
          </Feature>
          <Feature icon={ShieldCheck} title="Validation before write">
            Field values, users, and tags are validated client-side before any write — with “did you
            mean” suggestions for unknowns.
          </Feature>
          <Feature icon={KeyRound} title="Secure token storage">
            Tokens live in the OS keyring — macOS Keychain, Windows Credential Manager, Linux Secret
            Service.
          </Feature>
          <Feature icon={GitBranch} title="Git-aware releases">
            Extract issue IDs from commit history to produce QA-ready release reports.
          </Feature>
          <Feature icon={Cpu} title="Runs anywhere">
            Node 20+, browsers, Electron, and Tauri. Bring your own fetch when you need to.
          </Feature>
        </FeatureGrid>
      </Section>

      {/* Install */}
      <Section
        id="install"
        title="Install & run"
        description="Run TrackPilot without installing, or install it globally. Pick your package manager — every command returns JSON."
      >
        <CommandTabs
          variants={[
            { label: "npx", code: "npx trackpilot config get" },
            { label: "pnpm dlx", code: "pnpm dlx trackpilot config get" },
            { label: "yarn dlx", code: "yarn dlx trackpilot config get" },
            {
              label: "npm i -g",
              code: "npm i -g trackpilot\ntrackpilot config get",
            },
          ]}
        />
        <p className="text-sm text-muted-foreground">
          Prefer Yarn or pnpm globally? <code className="text-foreground">yarn global add trackpilot</code>{" "}
          and <code className="text-foreground">pnpm add -g trackpilot</code> work too. Requires Node
          20 or newer.
        </p>

        <h3 className="mt-4 font-semibold">Use it as a library</h3>
        <CommandTabs
          variants={[
            { label: "npm", code: "npm install trackpilot" },
            { label: "pnpm", code: "pnpm add trackpilot" },
            { label: "yarn", code: "yarn add trackpilot" },
          ]}
        />
      </Section>

      {/* Setup */}
      <Section
        title="Connect your YouTrack"
        description="Create a permanent token in YouTrack (Profile → Account Security → Authentication), then point TrackPilot at your instance."
      >
        <div className="grid grid-cols-1 gap-4">
          <Step n={1} title="Set your instance URL">
            <CodeBlock
              language="bash"
              code="trackpilot config set --base-url https://YOUR-INSTANCE.youtrack.cloud"
            />
          </Step>
          <Step n={2} title="Store your token (via stdin, never shell history)">
            <CodeBlock language="bash" code="printf %s 'perm:xxxxxxxx' | trackpilot config set-token" />
          </Step>
          <Step n={3} title="Verify">
            <CodeBlock language="bash" code="trackpilot config get" />
            <p>
              The token is kept in the OS keyring. In CI or headless environments, set{" "}
              <code className="text-foreground">YOUTRACK_TOKEN</code> and{" "}
              <code className="text-foreground">YOUTRACK_BASE_URL</code> instead — they take
              precedence over stored config.
            </p>
          </Step>
        </div>
      </Section>

      {/* CLI reference */}
      <Section
        title="CLI commands"
        description="Each command returns JSON. Writes are validated before they hit YouTrack."
      >
        <div className="flex flex-col gap-6">
          {COMMANDS.map((cmd) => (
            <div key={cmd.name} className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <ListChecks className="size-4 text-muted-foreground" />
                <code className="text-sm font-semibold">{cmd.signature}</code>
              </div>
              <p className="text-sm text-muted-foreground">{cmd.desc}</p>
              <CodeBlock language="bash" code={cmd.example} />
            </div>
          ))}
        </div>
      </Section>

      {/* Library API */}
      <Section
        title="Library API"
        description="Construct a client with createApi() and call typed, Promise-returning methods. Unlike the CLI, the library does not use the OS keyring — you supply the token and manage secret storage yourself."
      >
        <CodeBlock language="typescript" code={LIBRARY_EXAMPLE} />
        <p className="text-sm text-muted-foreground">
          Other methods include <code className="text-foreground">readIssue</code>,{" "}
          <code className="text-foreground">updateIssue</code>,{" "}
          <code className="text-foreground">projects</code>,{" "}
          <code className="text-foreground">projectSchema</code>,{" "}
          <code className="text-foreground">tags</code>, and a low-level{" "}
          <code className="text-foreground">request()</code> escape hatch. See the{" "}
          <a className="underline" href={GITHUB} target="_blank" rel="noopener noreferrer">
            README
          </a>{" "}
          for the full reference.
        </p>
      </Section>

      {/* Use with Claude */}
      <Section
        id="ai"
        title="Use it with Claude & other AI models"
        description="TrackPilot is built for AI workflows. JSON output plus validation-before-write means an agent can read a spec, draft subtasks, and apply commands without corrupting your tracker. Three ways to wire it up:"
      >
        {/* Method 1 — MCP server */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Plug className="size-5" />
            <h3 className="font-semibold">1. Run it as an MCP server (recommended)</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            <code className="text-foreground">trackpilot mcp</code> runs a local Model Context
            Protocol server over stdio, exposing YouTrack to MCP clients like Claude. It uses the
            same auth as the CLI — set your base URL and token first, or pass them through the client
            config.
          </p>
          <p className="text-sm font-medium">Claude Code:</p>
          <CodeBlock language="bash" code={CLAUDE_MCP_CLI} />
          <p className="text-sm font-medium">
            Claude Desktop — add to <code className="text-foreground">claude_desktop_config.json</code>:
          </p>
          <CodeBlock language="json" code={CLAUDE_MCP_DESKTOP} />
          <p className="text-xs text-muted-foreground">
            Exposes read tools (<code className="text-foreground">search</code>,{" "}
            <code className="text-foreground">read_issue</code>,{" "}
            <code className="text-foreground">list_projects</code>,{" "}
            <code className="text-foreground">project_schema</code>,{" "}
            <code className="text-foreground">list_users</code>,{" "}
            <code className="text-foreground">list_tags</code>,{" "}
            <code className="text-foreground">whoami</code>) and write tools (
            <code className="text-foreground">create_issue</code>,{" "}
            <code className="text-foreground">update_issue</code>,{" "}
            <code className="text-foreground">add_comment</code>,{" "}
            <code className="text-foreground">log_work</code>,{" "}
            <code className="text-foreground">apply_command</code>). Your client prompts for approval
            before each write.
          </p>
        </div>

        {/* Method 2 — coding agent at the CLI */}
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Bot className="size-5" />
            <h3 className="font-semibold">2. Point a coding agent at the CLI</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Give Claude Code (or any agent that can run a shell) the CLI and a short playbook. The
            agent reads, drafts, creates, and reports — parsing JSON at each step.
          </p>
          <CodeBlock language="bash" code={CLAUDE_CLI_PROMPT} />
        </div>

        {/* Method 3 — library as Claude API tools */}
        <div className="mt-6 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="size-5" />
            <h3 className="font-semibold">3. Wrap the library as Claude API tools</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Import <code className="text-foreground">createApi</code> and expose its methods as
            tools for the Claude API. The SDK&rsquo;s tool runner handles the agent loop.
          </p>
          <CodeBlock language="typescript" code={CLAUDE_TOOLS_EXAMPLE} />
          <p className="text-xs text-muted-foreground">
            Requires <code className="text-foreground">@anthropic-ai/sdk</code> and{" "}
            <code className="text-foreground">zod</code>. The same pattern works for any tool-calling
            model — TrackPilot just provides the typed YouTrack methods.
          </p>
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
        <a className="inline-flex items-center gap-1 hover:underline" href={NPM} target="_blank" rel="noopener noreferrer">
          npm package <ExternalLink className="size-3.5" />
        </a>
        <Link className="inline-flex items-center gap-1 hover:underline" href="/ylate">
          See also: Ylate
        </Link>
      </section>
    </main>
  );
}
