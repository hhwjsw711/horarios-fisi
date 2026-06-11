import type { ContractKey } from "@/lib/domain/schedule-data";
import type {
  AppRole,
  SchedulePayload,
  TeacherCourseImportResponse,
} from "@/lib/domain/types";

export type CompleteOnboardingAction = {
  action: "completeOnboarding";
  role: AppRole;
  school: string;
  code: string;
};

export type ScheduleMutationAction =
  | { action: "setContract"; contract: ContractKey }
  | { action: "setAvailability"; availability: string[] }
  | { action: "addCourse"; courseId: string }
  | { action: "removeCourse"; courseId: string }
  | { action: "assignTeacherCourse"; teacherId: string; courseId: string }
  | { action: "unassignTeacherCourse"; teacherId: string; courseId: string }
  | { action: "observe"; teacherId: string; note: string }
  | { action: "approve"; teacherId: string }
  | { action: "createCourse"; name: string; school: string; isThesis: boolean }
  | { action: "setCourseActive"; courseId: string; active: boolean }
  | { action: "setAcademicTerm"; academicTerm: string }
  | {
      action: "setUserAccess";
      userId: string;
      role: AppRole;
      school: string;
    }
  | { action: "setPeriodClosed"; closed: boolean }
  | { action: "submit" };

export type TeacherCourseImportAction = {
  action: "importTeacherCourses";
  apply: boolean;
  csv: string;
  replaceTeachers: boolean;
};

export type ScheduleAction =
  | CompleteOnboardingAction
  | ScheduleMutationAction
  | TeacherCourseImportAction;

export type ScheduleActionData = SchedulePayload | TeacherCourseImportResponse;

export type ScheduleActionRunResult =
  | { ok: true; data: ScheduleActionData }
  | { ok: false; error: string; status: number };

export type SchedulePayloadActionResponse =
  | { ok: true; payload: SchedulePayload }
  | { ok: false; error: string };

export type TeacherCourseImportActionResponse =
  | { ok: true; result: TeacherCourseImportResponse }
  | { ok: false; error: string };
