import { SessionCreateForm } from "@/components/poker/session-create-form";

export default function PokerHome() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold mb-6">Start a session</h1>
      <SessionCreateForm />
    </div>
  );
}
