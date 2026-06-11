import { neon } from "@neondatabase/serverless";
import * as XLSX from "xlsx";
import { ensureScheduleSchema } from "@/lib/data/schedule-db";
import { normalizeDepartment } from "@/lib/domain/schedule-data";

type FisiTeacher = {
  id: string;
  teacherCode: string;
  name: string;
  email: string;
  department: string;
};

type ExistingTeacher = {
  id: string;
  email: string;
  teacher_code: string | null;
};

const source = process.argv[2];

if (!source) {
  throw new Error("Uso: bun scripts/import-docentes-fisi.ts <xlsx>");
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

await ensureScheduleSchema();

const sql = neon(databaseUrl);
const teachers = readTeachers(source);
const existingRows = (await sql.query(
  "select id, lower(email) as email, teacher_code from teacher_profiles",
)) as ExistingTeacher[];
const byEmail = new Map(existingRows.map((row) => [row.email, row]));
const byCode = new Map(
  existingRows
    .filter((row) => row.teacher_code?.trim())
    .map((row) => [row.teacher_code?.trim().toUpperCase(), row] as const),
);
let inserted = 0;
let updated = 0;
let pruned = 0;

for (const teacher of teachers) {
  const matched =
    byEmail.get(teacher.email) ||
    (teacher.teacherCode
      ? byCode.get(teacher.teacherCode.toUpperCase())
      : undefined);
  const id = matched?.id ?? teacher.id;
  await sql.query(
    `
      insert into teacher_profiles (id, teacher_code, name, email, department, contract, status)
      values ($1, nullif($2, ''), $3, $4, $5, 'full', 'borrador')
      on conflict (id) do update set
        teacher_code = coalesce(nullif(excluded.teacher_code, ''), teacher_profiles.teacher_code),
        name = excluded.name,
        email = excluded.email,
        department = excluded.department,
        updated_at = case
          when teacher_profiles.teacher_code is distinct from coalesce(nullif(excluded.teacher_code, ''), teacher_profiles.teacher_code)
            or teacher_profiles.name is distinct from excluded.name
            or teacher_profiles.email is distinct from excluded.email
            or teacher_profiles.department is distinct from excluded.department
          then now()
          else teacher_profiles.updated_at
        end
    `,
    [id, teacher.teacherCode, teacher.name, teacher.email, teacher.department],
  );
  inserted += matched ? 0 : 1;
  updated += matched ? 1 : 0;
}

const syncedUsers = (await sql.query(`
  update app_users au
  set school = tp.department,
      code = case
        when au.role = 'docente' and au.code = '' and coalesce(tp.teacher_code, '') <> '' then tp.teacher_code
        else au.code
      end,
      updated_at = now()
  from teacher_profiles tp
  where lower(au.email) = lower(tp.email)
    and tp.department is not null
  returning au.clerk_user_id
`)) as { clerk_user_id: string }[];

const directionScopes = (await sql.query(`
  update app_users
  set school = case lower(email)
    when 'daisw.fisi@unmsm.edu.pe' then 'Ingeniería de Software'
    when 'dacc.fisi@unmsm.edu.pe' then 'Ciencias de la Computación'
    else school
  end,
      updated_at = now()
  where lower(email) in ('daisw.fisi@unmsm.edu.pe', 'dacc.fisi@unmsm.edu.pe')
  returning email
`)) as { email: string }[];

const prunedRows = (await sql.query(
  `
    delete from teacher_profiles tp
    where not (lower(tp.email) = any($1))
      and tp.status = 'borrador'
      and not exists (
        select 1
        from teacher_courses tc
        where tc.teacher_id = tp.id
      )
      and not exists (
        select 1
        from teacher_availability ta
        where ta.teacher_id = tp.id
      )
    returning id
  `,
  [teachers.map((teacher) => teacher.email)],
)) as { id: string }[];
pruned = prunedRows.length;

const departmentCounts = teachers.reduce<Record<string, number>>(
  (acc, teacher) => {
    acc[teacher.department] = (acc[teacher.department] ?? 0) + 1;
    return acc;
  },
  {},
);

console.log(
  JSON.stringify(
    {
      teachers: teachers.length,
      inserted,
      updated,
      pruned,
      departments: departmentCounts,
      syncedUsers: syncedUsers.length,
      directionScopes: directionScopes.map((row) => row.email),
    },
    null,
    2,
  ),
);

function readTeachers(file: string) {
  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error("El Excel no tiene hojas.");
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<
    string,
    unknown
  >[];
  const teachers: FisiTeacher[] = [];
  const emails = new Set<string>();
  for (const [index, row] of rows.entries()) {
    const email = normalize(row["Dirección de correo"]).toLowerCase();
    if (!email) {
      continue;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error(`Correo inválido en fila ${index + 2}: ${email}`);
    }
    if (emails.has(email)) {
      throw new Error(`Correo duplicado en Excel: ${email}`);
    }
    emails.add(email);
    const rawCode = normalize(row.Codigo);
    const teacherCode = rawCode.includes("?") ? "" : rawCode;
    const name = titleCase(normalize(row["Nombre completo"]));
    if (!name) {
      throw new Error(`Nombre vacío en fila ${index + 2}.`);
    }
    teachers.push({
      id: `doc-${slug(teacherCode || email.split("@")[0] || name)}`,
      teacherCode,
      name,
      email,
      department: normalizeDepartment(normalize(row.Departamento)),
    });
  }
  if (!teachers.length) {
    throw new Error("No se encontraron docentes en el Excel.");
  }
  return teachers;
}

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .toLocaleLowerCase("es-PE")
    .replace(
      /(^|[\s./()-])([a-záéíóúñü])/g,
      (_match, separator, char) =>
        `${separator}${String(char).toLocaleUpperCase("es-PE")}`,
    )
    .replace(/\bIi\b/g, "II")
    .replace(/\bIii\b/g, "III")
    .replace(/\bIv\b/g, "IV")
    .replace(/\bVi\b/g, "VI")
    .replace(/\bVii\b/g, "VII")
    .replace(/\bViii\b/g, "VIII")
    .replace(/\bIx\b/g, "IX")
    .replace(/\bX\b/g, "X");
}

function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
