"use client";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton({ next }: { next?: string }) {
  return (
    <Button onClick={() => signIn("youtrack", { callbackUrl: next ?? "/app" })}>
      Sign in with YouTrack
    </Button>
  );
}
