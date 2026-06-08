import type { Metadata } from "next";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Security & Privacy",
  description: "How Full House protects your YouTrack token and session data.",
  alternates: { canonical: `${env.NEXT_PUBLIC_SITE_URL}/security` },
  openGraph: {
    title: "Security & Privacy",
    description: "How Full House protects your YouTrack token and session data.",
    type: "article",
  },
  robots: { index: true, follow: true },
};

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-4xl font-bold">Security &amp; Privacy</h1>
        <p className="text-muted-foreground">
          Full House holds a personal access token (PAT) on your behalf so it can talk to YouTrack.
          Here&apos;s exactly how we protect it, what we log, and what your options are.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">How your token is stored</h2>
        <p>
          When you sign in with a YouTrack PAT, the token is encrypted with AES-256-GCM using a
          server-held master key. The encrypted bytes go into our database; the master key never
          leaves the application server.
        </p>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Algorithm: AES-256-GCM with a 12-byte random IV per token.</li>
          <li>Master key: 32 bytes, held in the deployment&apos;s secret store (Vercel env).</li>
          <li>Token is decrypted only at the moment a YouTrack API call needs to run, then discarded.</li>
          <li>Tokens are never logged, never sent to analytics, and never visible in error messages.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">What we store about you</h2>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>Your YouTrack user ID, login, display name, email, and avatar URL (fetched from /users/me).</li>
          <li>Your workspace URL (so we know which YouTrack to talk to).</li>
          <li>Your encrypted PAT.</li>
          <li>Session data: votes, estimates, comments — tied to your YouTrack identity.</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          We do not store the plaintext of any YouTrack issue body beyond what&apos;s needed to display it in the room.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">What we send to third parties</h2>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>
            <strong>YouTrack</strong> — the workspace you signed in with. Standard REST API calls
            authenticated by your PAT.
          </li>
          <li>
            <strong>Pusher Channels</strong> — real-time room events (who voted, when, what they cast).
            Pusher&apos;s privacy policy applies; no PATs cross this boundary.
          </li>
          <li>No marketing analytics, no ad networks, no other third parties.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Your options</h2>
        <ul className="list-disc pl-6 space-y-1 text-sm">
          <li>
            Revoke your PAT in YouTrack at any time (Profile → Account Security). The next call
            from Full House will fail with 401.
          </li>
          <li>
            Sign out — clears your session cookie. Your encrypted token stays in our database until
            you delete it.
          </li>
          <li>
            Delete your account from settings — removes your token row and all rooms you created.
            Sessions you joined as a voter stay anonymized.
          </li>
          <li>Browser-side encryption with your own password — coming soon as an opt-in.</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-semibold">Reporting issues</h2>
        <p className="text-sm">
          Found a vulnerability? Open a private security advisory in our GitHub repo or email the
          maintainer. We take responsible disclosure seriously.
        </p>
      </section>
    </main>
  );
}
