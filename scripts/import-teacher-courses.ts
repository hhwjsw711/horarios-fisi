import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { type ContractKey, contractRules } from "@/lib/schedule-data";

type TeacherRow = {
  id: string;
  teacher_code: string | null;
  email: string;
  name: string;
  contract: ContractKey;
};

type CourseRow = {
  id: string;
  code: string | null;
  name: string;
  school: string;
  is_thesis: boolean;
};

type CsvRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

type Assignment = {
  rowNumber: number;
  teacher: TeacherRow;
  course: CourseRow;
  position: number;
};

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
const records = parseCsv(await readFile(source, "utf8"));
const result = buildAssignments(
  records,
  teachers,
  courses,
  existingAssignments,
);

if (result.errors.length) {
  console.log(
    JSON.stringify(
      {
        ok: false,
        apply,
        replaceTeachers,
        rows: records.length,
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
  await writeAssignments(result.assignments);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      apply,
      replaceTeachers,
      rows: records.length,
      assignments: result.assignments.length,
      teachers: new Set(
        result.assignments.map((assignment) => assignment.teacher.id),
      ).size,
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
  )) as TeacherRow[];
}

async function readCourses() {
  return (await sql.query(
    `
      select id, code, name, school, is_thesis
      from courses
      where active = true
      order by school, name
    `,
  )) as CourseRow[];
}

async function readExistingAssignments() {
  const rows = (await sql.query(
    `
      select tc.teacher_id, c.id, c.code, c.name, c.school, c.is_thesis
      from teacher_courses tc
      join courses c on c.id = tc.course_id
    `,
  )) as Array<CourseRow & { teacher_id: string }>;
  const byTeacher = new Map<string, CourseRow[]>();
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

function parseCsv(body: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const next = body[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const header = rows[0]?.map(normalizeHeader) ?? [];
  if (!header.length) {
    throw new Error("CSV vacío.");
  }
  return rows
    .slice(1)
    .map((values, index) => ({
      rowNumber: index + 2,
      values: Object.fromEntries(
        header.map((key, keyIndex) => [key, normalize(values[keyIndex])]),
      ),
    }))
    .filter((record) =>
      Object.values(record.values).some((value) => value.length > 0),
    );
}

function buildAssignments(
  records: CsvRecord[],
  teachers: TeacherRow[],
  courses: CourseRow[],
  existingAssignments: Map<string, CourseRow[]>,
) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
  const teacherByCode = new Map(
    teachers
      .filter((teacher) => teacher.teacher_code)
      .map((teacher) => [normalizeKey(teacher.teacher_code ?? ""), teacher]),
  );
  const teacherByEmail = new Map(
    teachers.map((teacher) => [teacher.email.toLowerCase(), teacher]),
  );
  const courseById = new Map(courses.map((course) => [course.id, course]));
  const coursesByCode = courses.reduce((map, course) => {
    const key = normalizeKey(course.code ?? "");
    if (!key) {
      return map;
    }
    map.set(key, [...(map.get(key) ?? []), course]);
    return map;
  }, new Map<string, CourseRow[]>());
  const assignments: Assignment[] = [];
  const seenPairs = new Set<string>();

  for (const record of records) {
    const teacher = resolveTeacher(
      record,
      teacherById,
      teacherByCode,
      teacherByEmail,
      errors,
    );
    const course = resolveCourse(record, courseById, coursesByCode, errors);
    if (!teacher || !course) {
      continue;
    }
    const pairKey = `${teacher.id}:${course.id}`;
    if (seenPairs.has(pairKey)) {
      warnings.push(`Fila ${record.rowNumber}: asignación duplicada omitida.`);
      continue;
    }
    seenPairs.add(pairKey);
    assignments.push({
      rowNumber: record.rowNumber,
      teacher,
      course,
      position: Number(readValue(record, ["position", "orden"])) || 0,
    });
  }

  validateQuotas(assignments, existingAssignments, errors);

  return {
    assignments,
    errors,
    warnings,
  };
}

function resolveTeacher(
  record: CsvRecord,
  teacherById: Map<string, TeacherRow>,
  teacherByCode: Map<string, TeacherRow>,
  teacherByEmail: Map<string, TeacherRow>,
  errors: string[],
) {
  const id = readValue(record, ["teacher_id", "docente_id"]);
  const code = normalizeKey(
    readValue(record, ["teacher_code", "codigo_docente", "cod_docente"]),
  );
  const email = readValue(record, ["teacher_email", "email", "correo"])
    .toLowerCase()
    .trim();
  const teacher =
    (id ? teacherById.get(id) : undefined) ??
    (code ? teacherByCode.get(code) : undefined) ??
    (email ? teacherByEmail.get(email) : undefined);
  if (!teacher) {
    errors.push(`Fila ${record.rowNumber}: docente no encontrado.`);
  }
  return teacher;
}

function resolveCourse(
  record: CsvRecord,
  courseById: Map<string, CourseRow>,
  coursesByCode: Map<string, CourseRow[]>,
  errors: string[],
) {
  const id = readValue(record, ["course_id", "curso_id"]);
  if (id) {
    const course = courseById.get(id);
    if (!course) {
      errors.push(`Fila ${record.rowNumber}: course_id no encontrado.`);
    }
    return course;
  }
  const code = normalizeKey(
    readValue(record, ["course_code", "codigo_curso", "codigo", "code"]),
  );
  const school = normalizeKey(
    readValue(record, ["school", "escuela", "escuela_profesional"]),
  );
  const matches = (coursesByCode.get(code) ?? []).filter(
    (course) => !school || normalizeKey(course.school) === school,
  );
  if (!code) {
    errors.push(`Fila ${record.rowNumber}: curso sin código o id.`);
    return undefined;
  }
  if (matches.length === 1) {
    return matches[0];
  }
  if (matches.length > 1) {
    errors.push(
      `Fila ${record.rowNumber}: código de curso ambiguo, agrega escuela o course_id.`,
    );
    return undefined;
  }
  errors.push(`Fila ${record.rowNumber}: curso no encontrado.`);
  return undefined;
}

function validateQuotas(
  assignments: Assignment[],
  existingAssignments: Map<string, CourseRow[]>,
  errors: string[],
) {
  const byTeacher = new Map<string, Assignment[]>();
  for (const assignment of assignments) {
    byTeacher.set(assignment.teacher.id, [
      ...(byTeacher.get(assignment.teacher.id) ?? []),
      assignment,
    ]);
  }
  for (const [teacherId, teacherAssignments] of byTeacher) {
    const teacher = teacherAssignments[0]?.teacher;
    if (!teacher) {
      continue;
    }
    const importedCourses = teacherAssignments.map(
      (assignment) => assignment.course,
    );
    const baseCourses = replaceTeachers
      ? []
      : (existingAssignments.get(teacherId) ?? []);
    const finalCourses = new Map(
      [...baseCourses, ...importedCourses].map((course) => [course.id, course]),
    );
    const countedCourses = Array.from(finalCourses.values()).filter(
      (course) => !course.is_thesis,
    ).length;
    const maxCourses = contractRules[teacher.contract].maxCourses;
    if (countedCourses > maxCourses) {
      errors.push(
        `${teacher.name}: ${countedCourses}/${maxCourses} cursos no Tesis para ${contractRules[teacher.contract].label}.`,
      );
    }
  }
}

async function writeAssignments(assignments: Assignment[]) {
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

function readValue(record: CsvRecord, keys: string[]) {
  for (const key of keys) {
    const value = record.values[key];
    if (value) {
      return value;
    }
  }
  return "";
}

function normalize(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeHeader(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "");
}
