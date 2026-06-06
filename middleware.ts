import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/edge-config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

const ROOM_PATH = /^\/app\/poker\/[0-9a-f-]{36}\/?$/;

export default auth((req) => {
  const path = req.nextUrl.pathname;
  if (ROOM_PATH.test(path)) {
    // Open: the page handles auth. Forward the path as a request header so
    // the layout can recognize a room URL and skip its own auth gate.
    const requestHeaders = new Headers(req.headers);
    requestHeaders.set("x-pathname", path);
    return NextResponse.next({ request: { headers: requestHeaders } });
  }
  if (path.startsWith("/app") && !req.auth) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ["/app/:path*"],
};
