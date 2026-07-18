import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const signIn = vi.fn().mockResolvedValue({ error: undefined });
const refresh = vi.fn();

vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { VoterPicker, type Candidate } from "./voter-picker";

const candidates: Candidate[] = [
  { youtrackId: "yt-alice", login: "alice", name: "Alice", fullName: "Alice Anderson" },
  { youtrackId: "yt-bob", login: "bob", name: "Bob", fullName: "Bob Baker" },
];

describe("VoterPicker", () => {
  beforeEach(() => {
    signIn.mockClear();
    refresh.mockClear();
  });

  it("keeps a claimed name enabled and shows a non-blocking 'in room' hint", () => {
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    const alice = screen.getByRole("button", { name: /Alice Anderson/ });
    expect(alice).toBeEnabled();
    expect(alice.className).not.toContain("opacity-50");
    expect(alice.className).not.toContain("cursor-not-allowed");
    expect(screen.getByText("in room")).toBeInTheDocument();
    expect(screen.queryByText("already joined")).not.toBeInTheDocument();
  });

  it("re-runs signIn('voter') when a claimed name is clicked", async () => {
    const user = userEvent.setup();
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    await user.click(screen.getByRole("button", { name: /Alice Anderson/ }));
    expect(signIn).toHaveBeenCalledWith("voter", {
      sessionId: "s1",
      youtrackId: "yt-alice",
      redirect: false,
    });
  });

  it("leaves an unclaimed name selectable (parallel joins)", () => {
    render(
      <VoterPicker
        sessionId="s1"
        sessionName="Sprint 47"
        candidates={candidates}
        claimedYoutrackIds={["yt-alice"]}
      />,
    );
    expect(screen.getByRole("button", { name: /Bob Baker/ })).toBeEnabled();
  });
});
