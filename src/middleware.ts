import { type NextRequest, NextResponse } from "next/server";

// Lightweight edge-safe gate. We avoid importing the full Auth.js handler here
// (which pulls Node's "stream" via nodemailer/Prisma) and only inspect the
// session cookie. Real authorization is enforced server-side in route
// handlers and server actions.
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export default function middleware(req: NextRequest): NextResponse {
  const hasSession = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (!hasSession) {
    return NextResponse.redirect(new URL("/signin", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/w/:path*"],
};
