"use server";

import { revalidatePath } from "next/cache";
import { routing } from "@/i18n/routing";
import { runScheduleAction } from "@/lib/api/schedule-action-runner";
import type {
  CompleteOnboardingAction,
  ScheduleMutationAction,
  SchedulePayloadActionResponse,
  TeacherCourseImportActionResponse,
} from "@/lib/api/schedule-action-types";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";

export async function runScheduleMutation(
  action: ScheduleMutationAction,
): Promise<SchedulePayloadActionResponse> {
  const result = await runAuthenticatedAction(action);
  if (!result.ok) {
    return result;
  }
  if (!("profile" in result.data)) {
    return { ok: false, error: "toast.invalidResponse" };
  }
  revalidateScheduleRoutes();
  return { ok: true, payload: result.data };
}

export async function runTeacherCourseImport(
  action: Omit<TeacherCourseImportActionPayload, "action">,
): Promise<TeacherCourseImportActionResponse> {
  const result = await runAuthenticatedAction({
    action: "importTeacherCourses",
    ...action,
  });
  if (!result.ok) {
    return result;
  }
  if (!("payload" in result.data)) {
    return { ok: false, error: "toast.invalidResponse" };
  }
  revalidateScheduleRoutes();
  return { ok: true, result: result.data };
}

export async function completeOnboardingMutation(
  action: Omit<CompleteOnboardingAction, "action">,
): Promise<SchedulePayloadActionResponse> {
  const result = await runAuthenticatedAction({
    action: "completeOnboarding",
    ...action,
  });
  if (!result.ok) {
    return result;
  }
  if (!("profile" in result.data)) {
    return { ok: false, error: "toast.invalidResponse" };
  }
  revalidateScheduleRoutes();
  return { ok: true, payload: result.data };
}

type TeacherCourseImportActionPayload = {
  action: "importTeacherCourses";
  apply: boolean;
  csv: string;
  replaceTeachers: boolean;
};

async function runAuthenticatedAction(
  action: Record<string, unknown>,
): Promise<
  | Awaited<ReturnType<typeof runScheduleAction>>
  | { ok: false; error: string; status: number }
> {
  const identity = await resolveScheduleIdentity();
  if (!identity) {
    return { ok: false, error: "toast.invalidSession", status: 401 };
  }
  return runScheduleAction(identity, action);
}

function revalidateScheduleRoutes() {
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`, "layout");
  }
}
