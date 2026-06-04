import { auth, currentUser } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type ContractKey, contractRules } from "@/lib/schedule-data";
import type { AppRole } from "@/lib/schedule-db";
import {
  addCourse,
  completeOnboarding,
  getSchedulePayload,
  removeCourse,
  ScheduleError,
  type ScheduleIdentity,
  setAvailability,
  setContract,
  submitSchedule,
} from "@/lib/schedule-db";

export async function GET(request: NextRequest) {
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSchedulePayload(identity));
}

export async function PATCH(request: NextRequest) {
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await request.json();
  try {
    if (body.action === "completeOnboarding") {
      if (
        !isRole(body.role) ||
        typeof body.school !== "string" ||
        typeof body.code !== "string"
      ) {
        return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
      }
      return NextResponse.json(
        await completeOnboarding(identity, {
          role: body.role,
          school: body.school,
          code: body.code,
        }),
      );
    }
    if (body.action === "setContract") {
      if (!isContractKey(body.contract)) {
        return NextResponse.json(
          { error: "Invalid contract" },
          { status: 400 },
        );
      }
      return NextResponse.json(await setContract(identity, body.contract));
    }
    if (body.action === "setAvailability") {
      const availability = Array.isArray(body.availability)
        ? body.availability.filter(
            (value: unknown): value is string => typeof value === "string",
          )
        : [];
      return NextResponse.json(await setAvailability(identity, availability));
    }
    if (body.action === "addCourse") {
      if (typeof body.courseId !== "string") {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(await addCourse(identity, body.courseId));
    }
    if (body.action === "removeCourse") {
      if (typeof body.courseId !== "string") {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(await removeCourse(identity, body.courseId));
    }
    if (body.action === "submit") {
      return NextResponse.json(await submitSchedule(identity));
    }
  } catch (error) {
    if (error instanceof ScheduleError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

function isRole(value: unknown): value is AppRole {
  return value === "docente" || value === "direccion";
}

function isContractKey(value: unknown): value is ContractKey {
  return typeof value === "string" && value in contractRules;
}

async function resolveIdentity(
  request: NextRequest,
): Promise<ScheduleIdentity | null> {
  const preview =
    process.env.NODE_ENV !== "production" &&
    request.nextUrl.searchParams.get("preview") === "1";
  if (preview) {
    return {
      clerkUserId: "local-preview",
      email: "preview@unmsm.edu.pe",
      name: "Vista local",
      preview: true,
    };
  }
  try {
    const { userId } = await auth();
    if (userId) {
      const user = await currentUser();
      return {
        clerkUserId: userId,
        email:
          user?.primaryEmailAddress?.emailAddress ?? `${userId}@unmsm.edu.pe`,
        name: user?.fullName ?? user?.firstName ?? "Docente UNMSM",
      };
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return {
      clerkUserId: "local-preview",
      email: "preview@unmsm.edu.pe",
      name: "Vista local",
      preview: true,
    };
  }
  return null;
}
