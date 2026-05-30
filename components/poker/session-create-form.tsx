"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Board = { id: string; name: string };
type Sprint = { id: string; name: string };

export function SessionCreateForm() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [boardId, setBoardId] = useState<string>("");
  const [sprintId, setSprintId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/youtrack/boards").then((r) => r.json()).then((d) => setBoards(d.boards ?? []));
  }, []);

  useEffect(() => {
    if (!boardId) return;
    setSprints([]); setSprintId("");
    fetch(`/api/youtrack/boards/${boardId}/sprints`).then((r) => r.json()).then((d) => {
      setSprints(d.sprints ?? []);
      if (d.defaultSprintId) setSprintId(d.defaultSprintId);
    });
  }, [boardId]);

  const sprintName = sprints.find((s) => s.id === sprintId)?.name ?? "";

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, sprintId, sprintName }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { sessionId } = await res.json();
      router.push(`/app/poker/${sessionId}`);
    } catch (e) {
      toast.error(`Could not start session: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 max-w-md">
      <div>
        <Label className="mb-2 block">Board</Label>
        <Select value={boardId} onValueChange={setBoardId}>
          <SelectTrigger><SelectValue placeholder="Pick a board" /></SelectTrigger>
          <SelectContent>
            {boards.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-2 block">Sprint</Label>
        <Select value={sprintId} onValueChange={setSprintId} disabled={!boardId}>
          <SelectTrigger><SelectValue placeholder="Pick a sprint" /></SelectTrigger>
          <SelectContent>
            {sprints.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button disabled={!boardId || !sprintId || loading} onClick={start}>
        {loading ? "Starting…" : "Start session"}
      </Button>
    </div>
  );
}
