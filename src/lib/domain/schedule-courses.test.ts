import { describe, expect, test } from "bun:test";
import {
  courseBelongsToSchool,
  visibleCoursesForSchool,
} from "@/lib/domain/schedule-courses";
import { courseCatalog } from "@/lib/domain/schedule-data";

describe("schedule courses", () => {
  test("keeps transversal courses visible for every school", () => {
    expect(courseBelongsToSchool(courseCatalog[9], "Ing. de Sistemas")).toBe(
      true,
    );
    expect(courseBelongsToSchool(courseCatalog[9], "Contabilidad")).toBe(true);
  });

  test("filters active courses to the selected school and transversal catalog", () => {
    const visible = visibleCoursesForSchool(
      [
        ...courseCatalog,
        {
          id: "suspendido",
          name: "Curso suspendido",
          school: "Ing. de Sistemas",
          active: false,
        },
      ],
      "Contabilidad",
    );

    expect(visible.map((course) => course.id)).toEqual([
      "contabilidad-general",
      "costos",
      "tesis",
    ]);
  });
});
