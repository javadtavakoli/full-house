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
import { Input } from "@/components/ui/input";
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

export function PickIssueDialog({
  open,
  onOpenChange,
  sessionId,
  issueId,
  issueKey,
  defaultMode,
  defaultWithEstimation,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  issueId: string;
  issueKey: string;
  defaultMode: "simple" | "advanced";
  defaultWithEstimation: boolean;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">(defaultMode);
  const [withEstimation, setWithEstimation] =
    useState<boolean>(defaultWithEstimation);
  const [directMode, setDirectMode] = useState(false);
  const [sp, setSp] = useState("");
  const [dur, setDur] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setWithEstimation(defaultWithEstimation);
      setDirectMode(false);
      setSp("");
      setDur("");
    }
  }, [open, defaultMode, defaultWithEstimation]);

  async function startVoting() {
    setPending(true);
    const r = await fetch(`/api/sessions/${sessionId}/pick-issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, mode, withEstimation }),
    });
    setPending(false);
    if (!r.ok) {
      toast.error(await r.text());
      return;
    }
    onOpenChange(false);
    onDone();
  }

  async function enterDirectly() {
    setPending(true);
    const spNum = sp.trim() === "" ? null : Number(sp);
    const durNum = dur.trim() === "" ? null : Number(dur);
    if (
      (spNum !== null && !Number.isFinite(spNum)) ||
      (durNum !== null && !Number.isFinite(durNum))
    ) {
      toast.error("Enter valid numbers");
      setPending(false);
      return;
    }
    const r = await fetch(`/api/sessions/${sessionId}/enter-directly`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ issueId, sp: spNum, durationTotal: durNum }),
    });
    setPending(false);
    if (!r.ok) {
      toast.error(await r.text());
      return;
    }
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {directMode ? `Enter values for ${issueKey}` : `Estimate ${issueKey}`}
          </DialogTitle>
        </DialogHeader>
        {!directMode ? (
          <div className="flex flex-col gap-4">
            <div>
              <Label className="mb-1 block">Mode</Label>
              <Select
                value={mode}
                onValueChange={(v) => setMode(v as "simple" | "advanced")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="simple">
                    Simple — SP + one Estimation
                  </SelectItem>
                  <SelectItem value="advanced">
                    Advanced — SP + Implementation + Review + Test
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="we">Include time estimation</Label>
              <Switch
                id="we"
                checked={withEstimation}
                onCheckedChange={setWithEstimation}
              />
            </div>
            <Button
              variant="link"
              className="self-start px-0"
              onClick={() => setDirectMode(true)}
            >
              Or enter values directly without voting →
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="d-sp" className="mb-1 block">
                Story points
              </Label>
              <Input
                id="d-sp"
                type="number"
                value={sp}
                onChange={(e) => setSp(e.target.value)}
                placeholder="leave blank to skip"
              />
            </div>
            <div>
              <Label htmlFor="d-dur" className="mb-1 block">
                Total duration (hours)
              </Label>
              <Input
                id="d-dur"
                type="number"
                step={0.5}
                value={dur}
                onChange={(e) => setDur(e.target.value)}
                placeholder="leave blank to skip"
              />
            </div>
            <Button
              variant="link"
              className="self-start px-0"
              onClick={() => setDirectMode(false)}
            >
              ← Back to voting
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {directMode ? (
            <Button onClick={enterDirectly} disabled={pending}>
              {pending ? "Saving…" : "Save & complete"}
            </Button>
          ) : (
            <Button onClick={startVoting} disabled={pending}>
              {pending ? "Starting…" : "Start estimation"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
