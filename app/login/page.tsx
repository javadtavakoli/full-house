import { SignInButton } from "@/components/shell/sign-in-button";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold">Full House</h1>
      <p className="text-muted-foreground">Sign in to estimate sprints with your team.</p>
      <SignInButton next={params.next} />
    </main>
  );
}
