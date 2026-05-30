import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/edge-config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAppRoute = req.nextUrl.pathname.startsWith("/app");
  if (isAppRoute && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/app/:path*"],
};
