import { type ContractKey, contractRules } from "@/lib/domain/schedule-data";

export type TeacherCourseImportTeacher = {
  id: string;
  teacher_code: string | null;
  email: string;
  name: string;
  contract: ContractKey;
};

export type TeacherCourseImportCourse = {
  id: string;
  code: string | null;
  name: string;
  school: string;
  is_thesis: boolean;
};

export type TeacherCourseImportRecord = {
  rowNumber: number;
  values: Record<string, string>;
};

export type TeacherCourseImportAssignment = {
  rowNumber: number;
  teacher: TeacherCourseImportTeacher;
  course: TeacherCourseImportCourse;
  position: number;
};

export type TeacherCourseImportResult = {
  ok: boolean;
  rows: number;
  assignments: number;
  teachers: number;
  errors: string[];
  warnings: string[];
  preview: Array<{
    rowNumber: number;
    teacher: string;
    course: string;
    school: string;
  }>;
  resolvedAssignments: TeacherCourseImportAssignment[];
};

export function parseTeacherCourseCsv(
  body: string,
): TeacherCourseImportRecord[] {
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

export function buildTeacherCourseImport({
  courses,
  existingAssignments,
  records,
  replaceTeachers,
  teachers,
}: {
  courses: TeacherCourseImportCourse[];
  existingAssignments: Map<string, TeacherCourseImportCourse[]>;
  records: TeacherCourseImportRecord[];
  replaceTeachers: boolean;
  teachers: TeacherCourseImportTeacher[];
}): TeacherCourseImportResult {
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
  }, new Map<string, TeacherCourseImportCourse[]>());
  const resolvedAssignments: TeacherCourseImportAssignment[] = [];
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
    resolvedAssignments.push({
      rowNumber: record.rowNumber,
      teacher,
      course,
      position: Number(readValue(record, ["position", "orden"])) || 0,
    });
  }

  validateQuotas(
    resolvedAssignments,
    existingAssignments,
    replaceTeachers,
    errors,
  );

  return {
    ok: errors.length === 0,
    rows: records.length,
    assignments: resolvedAssignments.length,
    teachers: new Set(
      resolvedAssignments.map((assignment) => assignment.teacher.id),
    ).size,
    errors,
    warnings,
    preview: resolvedAssignments.slice(0, 12).map((assignment) => ({
      rowNumber: assignment.rowNumber,
      teacher: assignment.teacher.name,
      course: assignment.course.name,
      school: assignment.course.school,
    })),
    resolvedAssignments,
  };
}

function resolveTeacher(
  record: TeacherCourseImportRecord,
  teacherById: Map<string, TeacherCourseImportTeacher>,
  teacherByCode: Map<string, TeacherCourseImportTeacher>,
  teacherByEmail: Map<string, TeacherCourseImportTeacher>,
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
  record: TeacherCourseImportRecord,
  courseById: Map<string, TeacherCourseImportCourse>,
  coursesByCode: Map<string, TeacherCourseImportCourse[]>,
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
  assignments: TeacherCourseImportAssignment[],
  existingAssignments: Map<string, TeacherCourseImportCourse[]>,
  replaceTeachers: boolean,
  errors: string[],
) {
  const byTeacher = new Map<string, TeacherCourseImportAssignment[]>();
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
        `${teacher.name}: ${countedCourses}/${maxCourses} cursos no Tesis para ${contractRules[teacher.contract].fallbackLabel}.`,
      );
    }
  }
}

function readValue(record: TeacherCourseImportRecord, keys: string[]) {
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
