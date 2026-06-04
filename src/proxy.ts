import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";

const isDemoRoute = createRouteMatcher(["/demo(.*)"]);
const isDevelopmentBypassRoute = createRouteMatcher([
  "/docente(.*)",
  "/direccion(.*)",
  "/onboarding(.*)",
  "/api/schedule(.*)",
]);

const isScheduleApiRoute = createRouteMatcher(["/api/schedule(.*)"]);
const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

const clerkProxy = clerkMiddleware(
  async (auth, request) => {
    if (isScheduleApiRoute(request)) {
      return NextResponse.next();
    }
    if (!isPublicRoute(request)) {
      await auth.protect({
        unauthenticatedUrl: new URL("/sign-in", request.url).toString(),
      });
    }
  },
  {
    frontendApiProxy: {
      enabled: true,
    },
  },
);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (isDemoRoute(request)) {
    return NextResponse.next();
  }
  if (
    process.env.NODE_ENV !== "production" &&
    isDevelopmentBypassRoute(request)
  ) {
    return NextResponse.next();
  }
  return clerkProxy(request, event);
}

export const config = {
  matcher: [
    "/__clerk(.*)",
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
