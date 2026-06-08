import { env } from "@/lib/env";
import { LoginForm } from "@/components/shell/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold">Full House</h1>
      <p className="text-muted-foreground">Sign in with your YouTrack personal access token.</p>
      <LoginForm defaultWorkspaceUrl={env.YT_BASE_URL} next={params.next} />
    </main>
  );
}
