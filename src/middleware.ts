import { NextResponse, type NextRequest } from "next/server";
import { VISITOR_COOKIE, UUID_RE } from "@/lib/visitor";

export function middleware(request: NextRequest) {
  const existing = request.cookies.get(VISITOR_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) {
    return NextResponse.next();
  }

  const id = crypto.randomUUID();
  // Aufs Request-Objekt setzen, damit Server Components im selben
  // Request die ID schon sehen — dann in die Response übernehmen.
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request });
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}

export const config = {
  // Statische Assets und Next-Interna auslassen
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
