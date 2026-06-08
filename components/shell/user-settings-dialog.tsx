"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import Link from "next/link";
import { getStoredToken, setStoredToken } from "@/hooks/use-youtrack-token";
import {
  deriveKey,
  decryptString,
  encryptString,
  generateSalt,
  getDefaultIterations,
} from "@/lib/crypto/client";

type EncryptionBlob = {
  encryptedToken: string;
  salt: string | null;
  iterations: number;
  encryptionMode: "server" | "client";
};

type SubAction = "enable" | "change" | "disable" | null;

export function UserSettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">("advanced");
  const [withEstimation, setWithEstimation] = useState<boolean>(true);
  const [pending, setPending] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const [encryption, setEncryption] = useState<EncryptionBlob | null>(null);
  const [subAction, setSubAction] = useState<SubAction>(null);

  const loadEncryption = useCallback(async () => {
    const r = await fetch("/api/user/encryption/blob");
    if (r.ok) setEncryption((await r.json()) as EncryptionBlob);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setSubAction(null);
    (async () => {
      const r = await fetch("/api/user/defaults");
      if (r.ok) {
        const j = (await r.json()) as {
          defaultPokerMode: "simple" | "advanced" | null;
          defaultWithEstimation: boolean | null;
        };
        setMode(j.defaultPokerMode ?? "advanced");
        setWithEstimation(j.defaultWithEstimation ?? true);
      }
      await loadEncryption();
      setLoaded(true);
    })();
  }, [open, loadEncryption]);

  async function save() {
    setPending(true);
    const r = await fetch("/api/user/defaults", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultPokerMode: mode,
        defaultWithEstimation: withEstimation,
      }),
    });
    setPending(false);
    if (!r.ok) {
      toast.error(await r.text());
      return;
    }
    toast.success("Defaults saved");
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div>
              <Label className="mb-1 block">Default poker mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "simple" | "advanced")}
                disabled={!loaded}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">Simple — SP + one Estimation</SelectItem>
                  <SelectItem value="advanced">
                    Advanced — SP + Impl + Review + Test
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="settings-we">Include time estimation by default</Label>
              <Switch
                id="settings-we"
                checked={withEstimation}
                onCheckedChange={setWithEstimation}
                disabled={!loaded}
              />
            </div>

            <div className="border-t pt-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="block">Token encryption</Label>
                <span className="text-xs text-muted-foreground">
                  {encryption?.encryptionMode === "client"
                    ? "Password-protected"
                    : "Server-managed"}
                </span>
              </div>
              {encryption?.encryptionMode === "client" ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    Your token is encrypted with your password; we can&apos;t decrypt without it.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSubAction("change")}
                      disabled={!loaded}
                    >
                      Change password
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSubAction("disable")}
                      disabled={!loaded}
                    >
                      Remove password protection
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Your token is encrypted with our server master key. Enable password protection
                    to make it un-decryptable without your password.
                  </p>
                  <div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setSubAction("enable")}
                      disabled={!loaded}
                    >
                      Enable password protection
                    </Button>
                  </div>
                </>
              )}
            </div>

            <div className="border-t pt-3 text-sm">
              <Link
                href="/security"
                className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                Security &amp; privacy →
              </Link>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !loaded}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {subAction === "enable" && (
        <EnableProtectionDialog
          encryption={encryption}
          onClose={() => setSubAction(null)}
          onDone={() => {
            setSubAction(null);
            void loadEncryption();
          }}
        />
      )}
      {subAction === "change" && encryption && (
        <ChangePasswordDialog
          encryption={encryption}
          onClose={() => setSubAction(null)}
          onDone={() => {
            setSubAction(null);
            void loadEncryption();
          }}
        />
      )}
      {subAction === "disable" && encryption && (
        <DisableProtectionDialog
          encryption={encryption}
          onClose={() => setSubAction(null)}
          onDone={() => {
            setSubAction(null);
            void loadEncryption();
          }}
        />
      )}
    </>
  );
}

function EnableProtectionDialog({
  encryption,
  onClose,
  onDone,
}: {
  encryption: EncryptionBlob | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    const token = getStoredToken();
    if (!token) {
      setError("Please sign out and sign in again first to load your token into this tab.");
      return;
    }
    setSubmitting(true);
    try {
      const salt = generateSalt();
      const iterations = getDefaultIterations();
      const key = await deriveKey(newPassword, salt, iterations);
      const encryptedToken = await encryptString(token, key);
      const r = await fetch("/api/user/encryption/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptedToken, salt, iterations }),
      });
      if (!r.ok) {
        setError(await r.text());
        return;
      }
      // Keep the plaintext in sessionStorage so the rest of this tab still works.
      setStoredToken(token);
      toast.success("Password protection enabled");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enable password protection</DialogTitle>
          <DialogDescription>
            Set a password that only you know. Your token will be re-encrypted in this browser; we
            never see the password.{" "}
            {encryption?.encryptionMode === "client"
              ? "(You already have protection enabled.)"
              : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="enable-pw1" className="mb-1 block">New password</Label>
            <Input
              id="enable-pw1"
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="enable-pw2" className="mb-1 block">Confirm password</Label>
            <Input
              id="enable-pw2"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <p className="text-xs text-muted-foreground">
            If you forget your password, you must revoke the PAT in YouTrack and sign up again —
            there is no recovery.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !newPassword || !confirm}>
            {submitting ? "Enabling…" : "Enable"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChangePasswordDialog({
  encryption,
  onClose,
  onDone,
}: {
  encryption: EncryptionBlob;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (next.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    if (!encryption.salt) {
      setError("Internal state inconsistent: missing salt.");
      return;
    }
    setSubmitting(true);
    try {
      // Decrypt with the current password.
      let plain: string;
      try {
        const oldKey = await deriveKey(current, encryption.salt, encryption.iterations);
        plain = await decryptString(encryption.encryptedToken, oldKey);
      } catch {
        setError("Current password is wrong.");
        return;
      }
      // Re-encrypt with a fresh salt + new password.
      const salt = generateSalt();
      const iterations = getDefaultIterations();
      const newKey = await deriveKey(next, salt, iterations);
      const encryptedToken = await encryptString(plain, newKey);
      const r = await fetch("/api/user/encryption/change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ encryptedToken, salt, iterations }),
      });
      if (!r.ok) {
        setError(await r.text());
        return;
      }
      setStoredToken(plain);
      toast.success("Password changed");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="change-cur" className="mb-1 block">Current password</Label>
            <Input
              id="change-cur"
              type="password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label htmlFor="change-new" className="mb-1 block">New password</Label>
            <Input
              id="change-new"
              type="password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="change-confirm" className="mb-1 block">Confirm new password</Label>
            <Input
              id="change-confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !current || !next || !confirm}>
            {submitting ? "Changing…" : "Change password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DisableProtectionDialog({
  encryption,
  onClose,
  onDone,
}: {
  encryption: EncryptionBlob;
  onClose: () => void;
  onDone: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    if (!encryption.salt) {
      setError("Internal state inconsistent: missing salt.");
      return;
    }
    setSubmitting(true);
    try {
      // Decrypt with current password to confirm + recover plaintext.
      let plain: string;
      try {
        const key = await deriveKey(current, encryption.salt, encryption.iterations);
        plain = await decryptString(encryption.encryptedToken, key);
      } catch {
        setError("Wrong password.");
        return;
      }
      const r = await fetch("/api/user/encryption/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plainToken: plain }),
      });
      if (!r.ok) {
        setError(await r.text());
        return;
      }
      setStoredToken(plain);
      toast.success("Password protection removed");
      onDone();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !submitting) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove password protection</DialogTitle>
          <DialogDescription>
            Your token will be re-encrypted with our server master key. We&apos;ll be able to
            decrypt it again without your password.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div>
            <Label htmlFor="disable-cur" className="mb-1 block">Current password</Label>
            <Input
              id="disable-cur"
              type="password"
              autoFocus
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !current}>
            {submitting ? "Removing…" : "Remove protection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
