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

type Phase = { id: string; name: string };

function presetPhases(m: "simple" | "advanced"): Phase[] {
  return m === "simple"
    ? [{ id: "impl", name: "Estimation" }]
    : [
        { id: "impl", name: "Implementation" },
        { id: "review", name: "Review" },
        { id: "test", name: "Test" },
      ];
}

export function PickIssueDialog({
  open,
  onOpenChange,
  sessionId,
  issueId,
  issueKey,
  defaultMode,
  defaultWithEstimation,
  defaultPhases,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sessionId: string;
  issueId: string;
  issueKey: string;
  defaultMode: "simple" | "advanced";
  defaultWithEstimation: boolean;
  defaultPhases?: Phase[];
  onDone: () => void;
}) {
  const [mode, setMode] = useState<"simple" | "advanced">(defaultMode);
  const [withEstimation, setWithEstimation] =
    useState<boolean>(defaultWithEstimation);
  const [phases, setPhases] = useState<Phase[]>(
    defaultPhases ?? presetPhases(defaultMode),
  );
  const [directMode, setDirectMode] = useState(false);
  const [sp, setSp] = useState("");
  const [dur, setDur] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setMode(defaultMode);
      setWithEstimation(defaultWithEstimation);
      setPhases(defaultPhases ?? presetPhases(defaultMode));
      setDirectMode(false);
      setSp("");
      setDur("");
    }
  }, [open, defaultMode, defaultWithEstimation, defaultPhases]);

  async function startVoting() {
    setPending(true);
    const r = await fetch(`/api/sessions/${sessionId}/pick-issue`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        issueId,
        mode,
        withEstimation,
        phases: withEstimation ? phases : [],
      }),
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
                onValueChange={(v) => {
                  const m = v as "simple" | "advanced";
                  setMode(m);
                  setPhases(presetPhases(m));
                }}
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

            {withEstimation && (
              <div className="flex flex-col gap-2">
                <Label className="block">
                  Estimation phases (SP always runs first)
                </Label>
                {phases.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No phases — this issue will estimate SP only.
                  </p>
                )}
                {phases.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-2">
                    <Input
                      value={p.name}
                      onChange={(e) =>
                        setPhases((ps) =>
                          ps.map((x) =>
                            x.id === p.id ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === 0}
                      onClick={() =>
                        setPhases((ps) => {
                          const n = [...ps];
                          [n[i - 1], n[i]] = [n[i]!, n[i - 1]!];
                          return n;
                        })
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={i === phases.length - 1}
                      onClick={() =>
                        setPhases((ps) => {
                          const n = [...ps];
                          [n[i + 1], n[i]] = [n[i]!, n[i + 1]!];
                          return n;
                        })
                      }
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setPhases((ps) => ps.filter((x) => x.id !== p.id))
                      }
                    >
                      ✕
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    setPhases((ps) => [
                      ...ps,
                      { id: crypto.randomUUID(), name: `Phase ${ps.length + 1}` },
                    ])
                  }
                >
                  Add phase
                </Button>
              </div>
            )}

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
