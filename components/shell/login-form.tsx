"use client";
import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setStoredToken } from "@/hooks/use-youtrack-token";
import {
  deriveKey,
  decryptString,
  encryptString,
  generateSalt,
  getDefaultIterations,
} from "@/lib/crypto/client";

function isValidWorkspaceUrl(value: string): boolean {
  if (!value.startsWith("https://")) return false;
  try {
    const u = new URL(value);
    return !!u.hostname;
  } catch {
    return false;
  }
}

type Mode = "pat" | "password";

export function LoginForm({
  defaultWorkspaceUrl,
  next,
}: {
  defaultWorkspaceUrl?: string;
  next?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("pat");
  const [workspaceUrl, setWorkspaceUrl] = useState(defaultWorkspaceUrl ?? "");
  // PAT mode fields
  const [token, setToken] = useState("");
  const [protectWithPassword, setProtectWithPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // Password mode fields
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspaceOk = isValidWorkspaceUrl(workspaceUrl);

  function resetSensitive() {
    setNewPassword("");
    setConfirmPassword("");
    setPassword("");
  }

  function switchMode(next: Mode) {
    setError(null);
    resetSensitive();
    setMode(next);
  }

  async function onSubmitPat(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!workspaceOk) {
      setError("Workspace URL must start with https:// and have a hostname.");
      return;
    }
    if (protectWithPassword) {
      if (newPassword.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords don't match.");
        return;
      }
    }
    setLoading(true);
    try {
      if (protectWithPassword) {
        // Encrypt the token in the browser before sending it to next-auth.
        // The server validates the plaintext `token` once (via /users/me) and
        // then stores only `encryptedToken`. After this signup the server can
        // no longer decrypt it without the user's password.
        const salt = generateSalt();
        const iterations = getDefaultIterations();
        const key = await deriveKey(newPassword, salt, iterations);
        const encryptedToken = await encryptString(token, key);
        const res = await signIn("credentials", {
          workspaceUrl,
          token,
          encryptedToken,
          passwordSalt: salt,
          encryptionMode: "client",
          redirect: false,
        });
        if (res?.error) {
          setError("Invalid token, or token can't reach the workspace.");
          return;
        }
        // Cache plaintext token for this tab so subsequent API calls have it
        // via ytFetch's x-youtrack-token header.
        setStoredToken(token);
        router.push(next ?? "/app");
      } else {
        const res = await signIn("credentials", {
          workspaceUrl,
          token,
          redirect: false,
        });
        if (res?.error) {
          setError("Invalid token, or token can't reach the workspace.");
          return;
        }
        // Server-mode user — also cache the token so the room can use the
        // header path uniformly. (Server can also decrypt from the DB; either
        // works.)
        setStoredToken(token);
        router.push(next ?? "/app");
      }
    } finally {
      setLoading(false);
    }
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!workspaceOk) {
      setError("Workspace URL must start with https:// and have a hostname.");
      return;
    }
    if (!login.trim()) {
      setError("Please enter your YouTrack login.");
      return;
    }
    setLoading(true);
    try {
      // Step 1: look up the encrypted blob.
      const lookupRes = await fetch("/api/auth/lookup-encrypted", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceUrl, login: login.trim() }),
      });
      if (!lookupRes.ok) {
        setError("Could not contact the server.");
        return;
      }
      const lookup = (await lookupRes.json()) as {
        encryptedToken: string | null;
        salt?: string;
        iterations?: number;
      };
      if (!lookup.encryptedToken || !lookup.salt || !lookup.iterations) {
        setError("No password-protected account found for that workspace and login.");
        return;
      }

      // Step 2: derive key + decrypt.
      let plaintextToken: string;
      try {
        const key = await deriveKey(password, lookup.salt, lookup.iterations);
        plaintextToken = await decryptString(lookup.encryptedToken, key);
      } catch {
        setError("Wrong password.");
        return;
      }

      // Step 3: now we have the PAT — sign in normally. The server validates
      // it again via /users/me. We pass encryptionMode=client so the row stays
      // in client mode after the re-write.
      const res = await signIn("credentials", {
        workspaceUrl,
        token: plaintextToken,
        encryptedToken: lookup.encryptedToken,
        passwordSalt: lookup.salt,
        encryptionMode: "client",
        redirect: false,
      });
      if (res?.error) {
        setError("Token rejected by the workspace (perhaps revoked).");
        return;
      }
      setStoredToken(plaintextToken);
      router.push(next ?? "/app");
    } finally {
      setLoading(false);
    }
  }

  if (mode === "password") {
    return (
      <form onSubmit={onSubmitPassword} className="flex flex-col gap-4 w-full max-w-sm">
        <div>
          <Label htmlFor="workspaceUrl" className="mb-1 block">Workspace URL</Label>
          <Input
            id="workspaceUrl"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://your-workspace.youtrack.cloud"
            value={workspaceUrl}
            onChange={(e) => setWorkspaceUrl(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <Label htmlFor="login" className="mb-1 block">YouTrack login</Label>
          <Input
            id="login"
            type="text"
            autoComplete="username"
            placeholder="jane.doe"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            required
            disabled={loading}
          />
        </div>
        <div>
          <Label htmlFor="password" className="mb-1 block">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground mt-1">
            We never see your password. It decrypts your token locally.
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={loading || !workspaceOk || !login || !password}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={() => switchMode("pat")}
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-left"
        >
          First time or no password? Use your PAT →
        </button>
        <Link
          href="/security"
          className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          How we protect your token →
        </Link>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitPat} className="flex flex-col gap-4 w-full max-w-sm">
      <div>
        <Label htmlFor="workspaceUrl" className="mb-1 block">Workspace URL</Label>
        <Input
          id="workspaceUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://your-workspace.youtrack.cloud"
          value={workspaceUrl}
          onChange={(e) => setWorkspaceUrl(e.target.value)}
          required
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground mt-1">
          The URL of your YouTrack Cloud workspace — open YouTrack in a browser and copy the address.
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
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={protectWithPassword}
          onChange={(e) => setProtectWithPassword(e.target.checked)}
          disabled={loading}
        />
        <span>Encrypt with a password I&apos;ll set</span>
      </label>
      {protectWithPassword && (
        <div className="flex flex-col gap-3 border rounded p-3">
          <div>
            <Label htmlFor="newPassword" className="mb-1 block">New password</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="mb-1 block">Confirm password</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            We never see your password. If you forget it, you must revoke the PAT in YouTrack and
            sign up again — there is no recovery.
          </p>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={loading || !token || !workspaceOk}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
      <button
        type="button"
        onClick={() => switchMode("password")}
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline text-left"
      >
        Have a password set? Sign in with login + password →
      </button>
      <Link
        href="/security"
        className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
      >
        How we protect your token →
      </Link>
    </form>
  );
}
