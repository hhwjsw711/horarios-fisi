import { clerkClient } from "@clerk/nextjs/server";
import type {
  ScheduleActionData,
  ScheduleActionRunResult,
} from "@/lib/api/schedule-action-types";
import { isAppRole } from "@/lib/auth/schedule-identity";
import {
  addCourse,
  approveSchedule,
  assignTeacherCourse,
  completeOnboarding,
  createCourse,
  importTeacherCourses,
  observeSchedule,
  removeCourse,
  setAcademicTerm,
  setAvailability,
  setContract,
  setCourseActive,
  setPeriodClosed,
  setUserAccess,
  submitSchedule,
  unassignTeacherCourse,
  validateUserAccessChange,
} from "@/lib/data/schedule-db";
import { type ContractKey, contractRules } from "@/lib/domain/schedule-data";
import type { AppRole, ScheduleIdentity } from "@/lib/domain/types";
import { ScheduleError } from "@/lib/domain/types";

export async function runScheduleAction(
  identity: ScheduleIdentity,
  body: Record<string, unknown>,
): Promise<ScheduleActionRunResult> {
  try {
    return { ok: true, data: await runAction(identity, body) };
  } catch (error) {
    if (error instanceof ScheduleError) {
      return {
        ok: false,
        error: translateScheduleError(error.message),
        status: error.status,
      };
    }
    throw error;
  }
}

async function runAction(
  identity: ScheduleIdentity,
  body: Record<string, unknown>,
): Promise<ScheduleActionData> {
  if (body.action === "completeOnboarding") {
    if (
      !isAppRole(body.role) ||
      typeof body.school !== "string" ||
      typeof body.code !== "string"
    ) {
      throw new ScheduleError("Perfil no válido.", 400);
    }
    return completeOnboarding(identity, {
      role: body.role,
      school: body.school,
      code: body.code,
    });
  }
  if (body.action === "setContract") {
    if (!isContractKey(body.contract)) {
      throw new ScheduleError("Clase docente no válida.", 400);
    }
    return setContract(identity, body.contract);
  }
  if (body.action === "setAvailability") {
    const availability = Array.isArray(body.availability)
      ? body.availability.filter(
          (value: unknown): value is string => typeof value === "string",
        )
      : [];
    return setAvailability(identity, availability);
  }
  if (body.action === "addCourse") {
    if (typeof body.courseId !== "string") {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return addCourse(identity, body.courseId);
  }
  if (body.action === "removeCourse") {
    if (typeof body.courseId !== "string") {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return removeCourse(identity, body.courseId);
  }
  if (body.action === "assignTeacherCourse") {
    if (
      typeof body.teacherId !== "string" ||
      typeof body.courseId !== "string"
    ) {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return assignTeacherCourse(identity, body.teacherId, body.courseId);
  }
  if (body.action === "unassignTeacherCourse") {
    if (
      typeof body.teacherId !== "string" ||
      typeof body.courseId !== "string"
    ) {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return unassignTeacherCourse(identity, body.teacherId, body.courseId);
  }
  if (body.action === "observe") {
    if (typeof body.teacherId !== "string" || typeof body.note !== "string") {
      throw new ScheduleError("Revisión no válida.", 400);
    }
    return observeSchedule(identity, body.teacherId, body.note);
  }
  if (body.action === "approve") {
    if (typeof body.teacherId !== "string") {
      throw new ScheduleError("Revisión no válida.", 400);
    }
    return approveSchedule(identity, body.teacherId);
  }
  if (body.action === "createCourse") {
    if (typeof body.name !== "string" || typeof body.school !== "string") {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return createCourse(identity, {
      name: body.name,
      school: body.school,
      isThesis: Boolean(body.isThesis),
    });
  }
  if (body.action === "setCourseActive") {
    if (typeof body.courseId !== "string") {
      throw new ScheduleError("Curso no válido.", 400);
    }
    return setCourseActive(identity, body.courseId, Boolean(body.active));
  }
  if (body.action === "setAcademicTerm") {
    if (typeof body.academicTerm !== "string") {
      throw new ScheduleError("Periodo académico no válido.", 400);
    }
    return setAcademicTerm(identity, body.academicTerm);
  }
  if (body.action === "setUserAccess") {
    if (
      typeof body.userId !== "string" ||
      !isAppRole(body.role) ||
      typeof body.school !== "string"
    ) {
      throw new ScheduleError("Usuario no válido.", 400);
    }
    if (!identity.preview) {
      await validateUserAccessChange(
        identity,
        body.userId,
        body.role,
        body.school,
      );
      await updateClerkRole(body.userId, body.role);
    }
    return setUserAccess(identity, body.userId, body.role, body.school);
  }
  if (body.action === "setPeriodClosed") {
    return setPeriodClosed(identity, Boolean(body.closed));
  }
  if (body.action === "importTeacherCourses") {
    if (typeof body.csv !== "string") {
      throw new ScheduleError("CSV no válido.", 400);
    }
    return importTeacherCourses(identity, {
      apply: Boolean(body.apply),
      csv: body.csv,
      replaceTeachers: Boolean(body.replaceTeachers),
    });
  }
  if (body.action === "submit") {
    return submitSchedule(identity);
  }
  throw new ScheduleError("Acción no válida.", 400);
}

function isContractKey(value: unknown): value is ContractKey {
  return typeof value === "string" && value in contractRules;
}

async function updateClerkRole(userId: string, role: AppRole) {
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { role },
    });
  } catch {
    throw new ScheduleError("No se pudo actualizar el rol en Clerk.", 502);
  }
}

function translateScheduleError(message: string) {
  const key = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-PE");
  return scheduleErrorMessages[key] ?? message;
}

const scheduleErrorMessages: Record<string, string> = {
  "accion no valida.": "toast.invalidAction",
  "aprueba todos los horarios antes de cerrar.":
    "toast.approveAllBeforeClosing",
  "aun faltan reglas por completar.": "toast.scheduleFailsRules",
  "clase docente no valida.": "toast.invalidFacultyClass",
  "codigo institucional no valido.": "toast.invalidInstitutionalCode",
  "csv no valido.": "toast.invalidCsv",
  "curso no encontrado.": "toast.courseNotFound",
  "curso no valido.": "toast.invalidCourse",
  "curso y escuela son obligatorios.": "toast.courseAndSchoolRequired",
  "debe quedar al menos un usuario admin.": "toast.mustKeepOneAdmin",
  "departamento no valido.": "toast.invalidDepartment",
  "docente fuera de tu departamento.": "toast.teacherOutsideDepartment",
  "docente no encontrado.": "toast.facultyNotFound",
  "el horario no cumple las reglas.": "toast.scheduleFailsRules",
  "el periodo academico esta cerrado.": "toast.periodAlreadyClosed",
  "escribe una observacion mas especifica.": "toast.observationTooShort",
  "no hay docentes para cerrar el periodo.": "toast.noTeachersToClosePeriod",
  "no puedes retirar tu propio acceso.": "toast.cannotRemoveOwnAccess",
  "no se pudo actualizar el rol en clerk.": "toast.clerkRoleUpdateFailed",
  "no tienes acceso admin.": "toast.noAdminAccess",
  "no tienes acceso direccion.": "toast.noDirectionAccess",
  "perfil no valido.": "toast.invalidProfile",
  "periodo academico no valido.": "toast.invalidAcademicPeriod",
  "revision no valida.": "toast.invalidReview",
  "sandbox docente no encontrado.": "toast.sandboxNotFound",
  "solo puedes aprobar horarios enviados.": "toast.onlySubmittedCanBeApproved",
  "tu cuenta no tiene perfil docente asignado.": "toast.noFacultyProfile",
  "usuario no encontrado.": "toast.userNotFound",
  "usuario no valido.": "toast.userNotFound",
  "ya alcanzaste el maximo de cursos permitido.": "toast.maxCoursesAllowed",
};
