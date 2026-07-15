import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { extractRoleFromClaims, isActiveRole } from "@/lib/authz";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/protected(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const session = await auth();

    if (!session.userId) {
      await auth.protect();
      return;
    }

    const role = extractRoleFromClaims(session.sessionClaims);
    if (!isActiveRole(role)) {
      if (req.nextUrl.pathname.startsWith("/api/protected")) {
        return NextResponse.json(
          {
            error: "Account pending approval",
            role,
          },
          { status: 403 },
        );
      }

      return NextResponse.redirect(new URL("/access-pending", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
