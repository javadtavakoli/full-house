"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

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

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
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
      setLoaded(true);
    })();
  }, [open]);

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
  );
}
