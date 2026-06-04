import { describe, expect, test } from "bun:test";
import {
  courseCatalog,
  seedSlots,
  type TeacherProfile,
} from "@/lib/schedule-data";
import {
  completionForRules,
  courseAssignmentState,
  validateTeacherRules,
} from "@/lib/schedule-rules";

function profile(
  input: Pick<TeacherProfile, "availability" | "contract" | "courses">,
): TeacherProfile {
  return {
    id: "teacher",
    name: "Docente",
    email: "docente@unmsm.edu.pe",
    status: "borrador",
    ...input,
  };
}

describe("schedule rules", () => {
  test("marks a complete full-time schedule as valid", () => {
    const validation = validateTeacherRules(
      profile({
        contract: "full",
        courses: [courseCatalog[0], courseCatalog[1], courseCatalog[2]],
        availability: seedSlots({
          lunes: [8, 9, 10, 11, 14, 15, 16, 17],
          martes: [8, 9, 10, 11, 14, 15, 16, 17],
          miercoles: [8, 9, 10, 11, 14, 15, 16, 17],
          jueves: [8, 9, 10, 11, 14, 15, 16, 17],
          viernes: [8, 9, 10, 11, 14, 15, 16, 17],
        }),
      }),
    );

    expect(validation).toMatchObject({
      selectedHours: 40,
      blockDays: 5,
      countedCourses: 3,
      complete: true,
    });
  });

  test("rejects partial schedules without enough 4-hour days", () => {
    const validation = validateTeacherRules(
      profile({
        contract: "partial20",
        courses: [courseCatalog[0], courseCatalog[1]],
        availability: seedSlots({
          lunes: [8, 9, 10, 11],
          martes: [8, 10, 12, 14],
          miercoles: [14, 15, 16, 17],
          jueves: [14, 15, 16, 17],
          viernes: [18, 19, 20, 21],
        }),
      }),
    );

    expect(validation.selectedHours).toBe(20);
    expect(validation.blockDays).toBe(4);
    expect(validation.complete).toBe(false);
  });

  test("does not count thesis against course quota", () => {
    const validation = validateTeacherRules(
      profile({
        contract: "partial10",
        courses: [courseCatalog[3], courseCatalog[9]],
        availability: seedSlots({
          lunes: [8, 9, 10, 11],
          miercoles: [8, 9, 10, 11],
          viernes: [14, 15, 16, 17],
        }),
      }),
    );

    expect(validation.countedCourses).toBe(1);
    expect(validation.complete).toBe(true);
  });

  test("caps visual completion at 100", () => {
    const validation = validateTeacherRules(
      profile({
        contract: "partial10",
        courses: [courseCatalog[3]],
        availability: seedSlots({
          lunes: [8, 9, 10, 11, 14, 15, 16, 17],
          martes: [8, 9, 10, 11],
          miercoles: [8, 9, 10, 11],
        }),
      }),
    );

    expect(completionForRules({ contract: "partial10" }, validation)).toBe(100);
  });

  test("blocks non-thesis courses after the contract quota", () => {
    const assignment = courseAssignmentState(
      profile({
        contract: "partial10",
        courses: [courseCatalog[0]],
        availability: [],
      }),
      courseCatalog[1],
    );

    expect(assignment).toMatchObject({
      countedCourses: 1,
      limitReached: true,
      canAssign: false,
    });
  });

  test("allows thesis courses after the contract quota", () => {
    const assignment = courseAssignmentState(
      profile({
        contract: "partial10",
        courses: [courseCatalog[0]],
        availability: [],
      }),
      courseCatalog[9],
    );

    expect(assignment).toMatchObject({
      countedCourses: 1,
      limitReached: false,
      canAssign: true,
    });
  });

  test("does not allow assigning the same course twice", () => {
    const assignment = courseAssignmentState(
      profile({
        contract: "full",
        courses: [courseCatalog[0]],
        availability: [],
      }),
      courseCatalog[0],
    );

    expect(assignment).toMatchObject({
      alreadyAssigned: true,
      canAssign: false,
    });
  });
});
