import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isAdminRoute = createRouteMatcher([
  "/admin(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/schedule(.*)",
  "/booking(.*)",
  "/profile(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isAdminRoute(req)) {
    await auth.protect();
    return;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Exclude:
    //   - Next.js internals (_next/...)
    //   - Static asset files by extension (.png, .css, etc.)
    //   - .well-known/* — Apple Pay domain-association file MUST be
    //     served as plain text without any middleware interference.
    //     See public/.well-known/apple-developer-merchantid-domain-association.
    "/((?!_next|\\.well-known|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
