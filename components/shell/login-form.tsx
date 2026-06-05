"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ workspaceUrl, next }: { workspaceUrl: string; next?: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", { token, redirect: false });
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
        <Label className="mb-1 block">Workspace</Label>
        <p className="text-sm text-muted-foreground">{workspaceUrl}</p>
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
      <Button type="submit" disabled={loading || !token}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
