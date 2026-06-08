"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function isValidWorkspaceUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  try {
    const u = new URL(value);
    return !!u.hostname;
  } catch {
    return false;
  }
}

export function LoginForm({
  defaultWorkspaceUrl,
  next,
}: {
  defaultWorkspaceUrl?: string;
  next?: string;
}) {
  const router = useRouter();
  const [workspaceUrl, setWorkspaceUrl] = useState(defaultWorkspaceUrl ?? "");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceOk = isValidWorkspaceUrl(workspaceUrl);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!workspaceOk) {
      setError("Workspace URL must start with https:// and have a hostname.");
      return;
    }
    setLoading(true);
    const res = await signIn("credentials", { workspaceUrl, token, redirect: false });
    setLoading(false);
    if (res?.error) {
      setError("Invalid token, or token can't reach the workspace.");
      return;
    }
    router.push(next ?? "/app");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 w-full max-w-sm">
      <div>
        <Label htmlFor="workspaceUrl" className="mb-1 block">Workspace URL</Label>
        <Input
          id="workspaceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://acme.youtrack.cloud"
          value={workspaceUrl}
          onChange={(e) => setWorkspaceUrl(e.target.value)}
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Your YouTrack Cloud URL, e.g. <code>https://acme.youtrack.cloud</code>.
        </p>
      </div>
      <div>
        <Label htmlFor="token" className="mb-1 block">Personal access token</Label>
        <Input
          id="token"
          type="password"
          autoComplete="off"
          autoFocus
          placeholder="perm-..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Create one at Profile → Account Security → New token. Paste the full token, prefix included.
        </p>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading || !token || !workspaceOk}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <Link
        href="/security"
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        How we protect your token →
      </Link>
    </form>
  );
}
