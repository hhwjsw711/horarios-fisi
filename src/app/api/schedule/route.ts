import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { type NextRequest, NextResponse } from "next/server";
import { type ContractKey, contractRules } from "@/lib/schedule-data";
import type { AppRole } from "@/lib/schedule-db";
import {
  addCourse,
  approveSchedule,
  assignTeacherCourse,
  completeOnboarding,
  createCourse,
  getSchedulePayload,
  importTeacherCourses,
  observeSchedule,
  removeCourse,
  ScheduleError,
  type ScheduleIdentity,
  setAcademicTerm,
  setAvailability,
  setContract,
  setCourseActive,
  setPeriodClosed,
  setUserAccess,
  submitSchedule,
  unassignTeacherCourse,
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
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
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
    if (body.action === "assignTeacherCourse") {
      if (
        typeof body.teacherId !== "string" ||
        typeof body.courseId !== "string"
      ) {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(
        await assignTeacherCourse(identity, body.teacherId, body.courseId),
      );
    }
    if (body.action === "unassignTeacherCourse") {
      if (
        typeof body.teacherId !== "string" ||
        typeof body.courseId !== "string"
      ) {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(
        await unassignTeacherCourse(identity, body.teacherId, body.courseId),
      );
    }
    if (body.action === "observe") {
      if (typeof body.teacherId !== "string" || typeof body.note !== "string") {
        return NextResponse.json({ error: "Invalid review" }, { status: 400 });
      }
      return NextResponse.json(
        await observeSchedule(identity, body.teacherId, body.note),
      );
    }
    if (body.action === "approve") {
      if (typeof body.teacherId !== "string") {
        return NextResponse.json({ error: "Invalid review" }, { status: 400 });
      }
      return NextResponse.json(await approveSchedule(identity, body.teacherId));
    }
    if (body.action === "createCourse") {
      if (typeof body.name !== "string" || typeof body.school !== "string") {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(
        await createCourse(identity, {
          name: body.name,
          school: body.school,
          isThesis: Boolean(body.isThesis),
        }),
      );
    }
    if (body.action === "setCourseActive") {
      if (typeof body.courseId !== "string") {
        return NextResponse.json({ error: "Invalid course" }, { status: 400 });
      }
      return NextResponse.json(
        await setCourseActive(identity, body.courseId, Boolean(body.active)),
      );
    }
    if (body.action === "setAcademicTerm") {
      if (typeof body.academicTerm !== "string") {
        return NextResponse.json({ error: "Invalid term" }, { status: 400 });
      }
      return NextResponse.json(
        await setAcademicTerm(identity, body.academicTerm),
      );
    }
    if (body.action === "setUserAccess") {
      if (
        typeof body.userId !== "string" ||
        !isRole(body.role) ||
        typeof body.school !== "string"
      ) {
        return NextResponse.json({ error: "Invalid user" }, { status: 400 });
      }
      const payload = await setUserAccess(
        identity,
        body.userId,
        body.role,
        body.school,
      );
      await updateClerkRole(body.userId, body.role);
      return NextResponse.json(payload);
    }
    if (body.action === "setPeriodClosed") {
      return NextResponse.json(
        await setPeriodClosed(identity, Boolean(body.closed)),
      );
    }
    if (body.action === "importTeacherCourses") {
      if (typeof body.csv !== "string") {
        return NextResponse.json({ error: "Invalid CSV" }, { status: 400 });
      }
      return NextResponse.json(
        await importTeacherCourses(identity, {
          apply: Boolean(body.apply),
          csv: body.csv,
          replaceTeachers: Boolean(body.replaceTeachers),
        }),
      );
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
  return value === "docente" || value === "direccion" || value === "admin";
}

function isContractKey(value: unknown): value is ContractKey {
  return typeof value === "string" && value in contractRules;
}

async function updateClerkRole(userId: string, role: AppRole) {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { role },
  });
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
      const role = isRole(user?.publicMetadata?.role)
        ? user.publicMetadata.role
        : undefined;
      return {
        clerkUserId: userId,
        email:
          user?.primaryEmailAddress?.emailAddress ?? `${userId}@unmsm.edu.pe`,
        imageUrl: user?.imageUrl,
        name: user?.fullName ?? user?.firstName ?? "Docente UNMSM",
        role,
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
