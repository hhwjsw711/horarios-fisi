import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import {
  buildTeacherCourseImport,
  parseTeacherCourseCsv,
  type TeacherCourseImportCourse,
  type TeacherCourseImportTeacher,
} from "@/lib/teacher-course-import";

const source = process.argv[2];
const apply = process.argv.includes("--apply");
const replaceTeachers = process.argv.includes("--replace-teachers");

if (!source) {
  throw new Error(
    "Uso: bun scripts/import-teacher-courses.ts <csv> [--apply] [--replace-teachers]",
  );
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const sql = neon(process.env.DATABASE_URL);
const [teachers, courses, existingAssignments] = await Promise.all([
  readTeachers(),
  readCourses(),
  readExistingAssignments(),
]);
const records = parseTeacherCourseCsv(await readFile(source, "utf8"));
const result = buildTeacherCourseImport({
  courses,
  existingAssignments,
  records,
  replaceTeachers,
  teachers,
});

if (result.errors.length) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        apply,
        replaceTeachers,
        rows: result.rows,
        errors: result.errors,
        warnings: result.warnings,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

if (apply) {
  await writeAssignments(result.resolvedAssignments);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      replaceTeachers,
      rows: result.rows,
      assignments: result.assignments,
      teachers: result.teachers,
      warnings: result.warnings,
    },
    null,
    2,
  ),
);

async function readTeachers() {
  return (await sql.query(
    `
      select id, teacher_code, email, name, contract
      from teacher_profiles
      order by name
    `,
  )) as TeacherCourseImportTeacher[];
}

async function readCourses() {
  return (await sql.query(
    `
      select id, code, name, school, is_thesis
      from courses
      where active = true
      order by school, name
    `,
  )) as TeacherCourseImportCourse[];
}

async function readExistingAssignments() {
  const rows = (await sql.query(
    `
      select tc.teacher_id, c.id, c.code, c.name, c.school, c.is_thesis
      from teacher_courses tc
      join courses c on c.id = tc.course_id
    `,
  )) as Array<TeacherCourseImportCourse & { teacher_id: string }>;
  const byTeacher = new Map<string, TeacherCourseImportCourse[]>();
  for (const row of rows) {
    const coursesForTeacher = byTeacher.get(row.teacher_id) ?? [];
    coursesForTeacher.push({
      id: row.id,
      code: row.code,
      name: row.name,
      school: row.school,
      is_thesis: row.is_thesis,
    });
    byTeacher.set(row.teacher_id, coursesForTeacher);
  }
  return byTeacher;
}

async function writeAssignments(
  assignments: ReturnType<
    typeof buildTeacherCourseImport
  >["resolvedAssignments"],
) {
  if (!assignments.length) {
    return;
  }
  const teacherIds = Array.from(
    new Set(assignments.map((assignment) => assignment.teacher.id)),
  );
  await sql.transaction((tx) => [
    ...(replaceTeachers
      ? teacherIds.map(
          (teacherId) =>
            tx`delete from teacher_courses where teacher_id = ${teacherId}`,
        )
      : []),
    ...assignments.map(
      (assignment) =>
        tx`
          insert into teacher_courses (teacher_id, course_id, position)
          values (${assignment.teacher.id}, ${assignment.course.id}, ${assignment.position})
          on conflict (teacher_id, course_id) do update set
            position = excluded.position
        `,
    ),
  ]);
}
