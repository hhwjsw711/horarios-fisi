import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const intlMiddleware = createMiddleware(routing);

const isDemoRoute = createRouteMatcher(["/:lang/demo(.*)"]);
const isDevelopmentBypassRoute = createRouteMatcher([
  "/:lang/teacher(.*)",
  "/:lang/direction(.*)",
  "/:lang/onboarding(.*)",
  "/api/schedule(.*)",
]);

const isScheduleApiRoute = createRouteMatcher(["/api/schedule(.*)"]);
const isHealthRoute = createRouteMatcher(["/api/health(.*)"]);
const isWebhookRoute = createRouteMatcher(["/api/webhooks(.*)"]);
const isPublicRoute = createRouteMatcher([
  "/:lang",
  "/:lang/opengraph-image(.*)",
  "/:lang/sign-in(.*)",
  "/:lang/sign-up(.*)",
]);

const clerkProxy = clerkMiddleware(async (auth, request) => {
  if (
    isScheduleApiRoute(request) ||
    isHealthRoute(request) ||
    isWebhookRoute(request)
  ) {
    return NextResponse.next();
  }
  if (!isPublicRoute(request)) {
    const locale = request.nextUrl.pathname.split("/")[1] || "es";
    await auth.protect({
      unauthenticatedUrl: new URL(`/${locale}/sign-in`, request.url).toString(),
    });
  }
});

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // Skip API routes and static assets for intl processing
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next")) {
    return clerkProxy(request, event);
  }

  // Handle legacy Spanish paths
  if (isLegacySpanishPath(pathname)) {
    const nextUrl = request.nextUrl.clone();
    nextUrl.pathname = `/${routing.defaultLocale}${legacySpanishPath(pathname)}`;
    return NextResponse.redirect(nextUrl);
  }

  // Run intl middleware first (handles locale detection, redirects, rewrites)
  const intlResponse = intlMiddleware(request);

  // For public routes, just return the intl response
  if (isDemoRoute(request)) {
    return intlResponse;
  }

  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    return intlResponse;
  }

  // Apply Clerk auth on the intl-processed request
  if (
    process.env.NODE_ENV !== "production" &&
    isDevelopmentBypassRoute(request)
  ) {
    return intlResponse;
  }

  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

function isLegacySpanishPath(pathname: string) {
  return (
    pathname === "/docente" ||
    pathname.startsWith("/docente/") ||
    pathname === "/direccion" ||
    pathname.startsWith("/direccion/")
  );
}

function legacySpanishPath(pathname: string) {
  if (pathname === "/docente") {
    return "/teacher";
  }
  if (pathname.startsWith("/docente/")) {
    return `/teacher/${pathname.slice("/docente/".length)}`;
  }
  if (pathname === "/direccion") {
    return "/direction";
  }
  if (pathname === "/direccion/usuarios") {
    return "/direction/users";
  }
  if (pathname === "/direccion/auditoria") {
    return "/direction/audit";
  }
  if (pathname === "/direccion/configuracion") {
    return "/direction/settings";
  }
  if (pathname.startsWith("/direccion/")) {
    return `/direction/${pathname.slice("/direccion/".length)}`;
  }
  return pathname;
}
