import Link from "next/link";
import { UserMenu } from "./user-menu";
import { getServerUser } from "@/lib/auth/session";

export async function AppNav() {
  const user = await getServerUser();
  if (!user) return null;
  return (
    <nav className="border-b">
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link href="/app" className="font-semibold">Full House</Link>
        <div className="flex items-center gap-4">
          <Link href="/app/poker" className="text-sm text-muted-foreground hover:text-foreground">Poker</Link>
          <UserMenu name={user.displayName} email={user.email} image={user.avatarUrl} />
        </div>
      </div>
    </nav>
  );
}
