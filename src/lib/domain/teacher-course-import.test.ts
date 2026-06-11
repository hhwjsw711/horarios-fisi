import { describe, expect, test } from "bun:test";
import {
  buildTeacherCourseImport,
  parseTeacherCourseCsv,
  type TeacherCourseImportCourse,
  type TeacherCourseImportTeacher,
} from "@/lib/domain/teacher-course-import";

const teachers: TeacherCourseImportTeacher[] = [
  {
    id: "teacher-1",
    teacher_code: "DOC-001",
    email: "ana@unmsm.edu.pe",
    name: "Ana Torres",
    contract: "full",
  },
  {
    id: "teacher-2",
    teacher_code: "DOC-002",
    email: "luis@unmsm.edu.pe",
    name: "Luis Ramos",
    contract: "partial10",
  },
];

const courses: TeacherCourseImportCourse[] = [
  {
    id: "si-201",
    code: "201",
    name: "Algoritmos",
    school: "Ing. de Sistemas",
    is_thesis: false,
  },
  {
    id: "con-201",
    code: "201",
    name: "Contabilidad General",
    school: "Contabilidad",
    is_thesis: false,
  },
  {
    id: "si-202",
    code: "202",
    name: "Base de Datos",
    school: "Ing. de Sistemas",
    is_thesis: false,
  },
  {
    id: "si-tesis",
    code: "999",
    name: "Tesis",
    school: "Ing. de Sistemas",
    is_thesis: true,
  },
];

describe("teacher course import", () => {
  test("parses normalized CSV headers and quoted values", () => {
    const records = parseTeacherCourseCsv(
      [
        "código docente,código curso,escuela profesional,orden",
        '"DOC-001","201","Ing. de Sistemas","2"',
        "",
      ].join("\n"),
    );

    expect(records).toEqual([
      {
        rowNumber: 2,
        values: {
          codigo_docente: "DOC-001",
          codigo_curso: "201",
          escuela_profesional: "Ing. de Sistemas",
          orden: "2",
        },
      },
    ]);
  });

  test("resolves teachers and courses, omitting duplicate assignments", () => {
    const records = parseTeacherCourseCsv(
      [
        "teacher_code,teacher_email,course_code,course_id,school,position",
        "DOC-001,,201,,Ing. de Sistemas,1",
        "DOC-001,,201,,Ing. de Sistemas,2",
        ",ana@unmsm.edu.pe,,si-202,,3",
      ].join("\n"),
    );

    const result = buildTeacherCourseImport({
      courses,
      existingAssignments: new Map(),
      records,
      replaceTeachers: true,
      teachers,
    });

    expect(result.ok).toBe(true);
    expect(result.assignments).toBe(2);
    expect(result.teachers).toBe(1);
    expect(result.warnings).toContain("Fila 3: asignación duplicada omitida.");
    expect(result.preview).toMatchObject([
      {
        teacher: "Ana Torres",
        course: "Algoritmos",
        school: "Ing. de Sistemas",
      },
      {
        teacher: "Ana Torres",
        course: "Base de Datos",
        school: "Ing. de Sistemas",
      },
    ]);
  });

  test("requires school or course id when a course code is ambiguous", () => {
    const records = parseTeacherCourseCsv(
      ["teacher_code,course_code", "DOC-001,201"].join("\n"),
    );

    const result = buildTeacherCourseImport({
      courses,
      existingAssignments: new Map(),
      records,
      replaceTeachers: true,
      teachers,
    });

    expect(result.ok).toBe(false);
    expect(result.errors).toContain(
      "Fila 2: código de curso ambiguo, agrega escuela o course_id.",
    );
  });

  test("validates quotas against existing assignments unless replacing", () => {
    const records = parseTeacherCourseCsv(
      ["teacher_code,course_code,school", "DOC-002,202,Ing. de Sistemas"].join(
        "\n",
      ),
    );
    const existingAssignments = new Map([
      ["teacher-2", [courses[0] as TeacherCourseImportCourse]],
    ]);

    const appendResult = buildTeacherCourseImport({
      courses,
      existingAssignments,
      records,
      replaceTeachers: false,
      teachers,
    });
    const replaceResult = buildTeacherCourseImport({
      courses,
      existingAssignments,
      records,
      replaceTeachers: true,
      teachers,
    });

    expect(appendResult.ok).toBe(false);
    expect(appendResult.errors).toContain(
      "Luis Ramos: 2/1 cursos no Tesis para Tiempo parcial 10 h.",
    );
    expect(replaceResult.ok).toBe(true);
  });

  test("does not count thesis courses against quota", () => {
    const records = parseTeacherCourseCsv(
      [
        "teacher_code,course_code,school",
        "DOC-002,202,Ing. de Sistemas",
        "DOC-002,999,Ing. de Sistemas",
      ].join("\n"),
    );

    const result = buildTeacherCourseImport({
      courses,
      existingAssignments: new Map(),
      records,
      replaceTeachers: true,
      teachers,
    });

    expect(result.ok).toBe(true);
    expect(result.assignments).toBe(2);
  });
});
