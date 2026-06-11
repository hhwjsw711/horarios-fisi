import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { text } from "node:stream/consumers";
import { neon } from "@neondatabase/serverless";
import * as XLSX from "xlsx";
import { ensureScheduleSchema } from "@/lib/data/schedule-db";

type FisiCourse = {
  id: string;
  code: string;
  name: string;
  school: string;
  isThesis: boolean;
  cycle: number | null;
  credits: number | null;
  courseType: string | null;
  curriculum: string;
};

type FisiTeacher = {
  id: string;
  teacherCode: string;
  name: string;
  email: string;
  category: string;
  academicDegree: string;
};

const source = process.argv[2];
const deactivateExisting = process.argv.includes("--deactivate-existing");

if (!source) {
  throw new Error(
    "Uso: bun scripts/import-fisi.ts <zip-o-carpeta> [--deactivate-existing]",
  );
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const workspace = await prepareSource(source);
const workbookPath = await findFirst(workspace, "ReportePlanes_FISI.xlsx");
const padronPdfPath = await findFirst(
  workspace,
  "Padron de Docentes Sistemas.pdf",
);
const padronTextPath = join(tmpdir(), `padron-fisi-${Date.now()}.txt`);

await run(["pdftotext", "-layout", padronPdfPath, padronTextPath]);

const courses = readCourses(workbookPath);
const teachers = readTeachers(await readFile(padronTextPath, "utf8"));

if (courses.length !== 217) {
  throw new Error(
    `Se esperaban 217 cursos FISI, se obtuvieron ${courses.length}.`,
  );
}
if (teachers.length !== 93) {
  throw new Error(
    `Se esperaban 93 docentes, se obtuvieron ${teachers.length}.`,
  );
}

await ensureScheduleSchema();
const sql = neon(databaseUrl);

for (const course of courses) {
  await sql.query(
    `
      insert into courses (id, code, name, school, active, is_thesis, cycle, credits, course_type, curriculum)
      values ($1, $2, $3, $4, true, $5, $6, $7, $8, $9)
      on conflict (id) do update set
        code = excluded.code,
        name = excluded.name,
        school = excluded.school,
        active = true,
        is_thesis = excluded.is_thesis,
        cycle = excluded.cycle,
        credits = excluded.credits,
        course_type = excluded.course_type,
        curriculum = excluded.curriculum
    `,
    [
      course.id,
      course.code,
      course.name,
      course.school,
      course.isThesis,
      course.cycle,
      course.credits,
      course.courseType,
      course.curriculum,
    ],
  );
}

if (deactivateExisting) {
  const placeholders = courses.map((_, index) => `$${index + 1}`).join(", ");
  await sql.query(
    `update courses set active = false where id not in (${placeholders})`,
    courses.map((course) => course.id),
  );
}

for (const teacher of teachers) {
  await sql.query(
    `
      insert into teacher_profiles (id, teacher_code, name, email, contract, status, category, academic_degree)
      values ($1, $2, $3, $4, 'full', 'borrador', $5, $6)
      on conflict (id) do update set
        teacher_code = excluded.teacher_code,
        name = excluded.name,
        email = excluded.email,
        category = excluded.category,
        academic_degree = excluded.academic_degree,
        updated_at = now()
    `,
    [
      teacher.id,
      teacher.teacherCode,
      teacher.name,
      teacher.email,
      teacher.category,
      teacher.academicDegree,
    ],
  );
}

await rm(padronTextPath, { force: true });
if (workspace !== source) {
  await rm(workspace, { force: true, recursive: true });
}

console.log(
  JSON.stringify(
    {
      courses: courses.length,
      teachers: teachers.length,
      schools: Array.from(new Set(courses.map((course) => course.school))),
      deactivatedExistingCourses: deactivateExisting,
    },
    null,
    2,
  ),
);

async function prepareSource(input: string) {
  if (!input.endsWith(".zip")) {
    return input;
  }
  const dir = await mkdtemp(join(tmpdir(), "planes-fisi-"));
  await run(["unzip", "-q", input, "-d", dir]);
  return dir;
}

async function run(command: string[]) {
  const process = spawn(command[0] ?? "", command.slice(1), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    text(process.stdout),
    text(process.stderr),
    new Promise<number | null>((resolve) => process.on("close", resolve)),
  ]);
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} failed: ${stderr || stdout}`);
  }
}

async function findFirst(root: string, filename: string) {
  const proc = spawn("find", [root, "-name", filename, "-type", "f"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const [output, exitCode] = await Promise.all([
    text(proc.stdout),
    new Promise<number | null>((resolve) => proc.on("close", resolve)),
  ]);
  if (exitCode !== 0) {
    throw new Error(`No se pudo buscar ${filename} en ${basename(root)}.`);
  }
  const match = output
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!match) {
    throw new Error(`No se encontró ${filename} en ${basename(root)}.`);
  }
  return match;
}

function readCourses(file: string): FisiCourse[] {
  const schoolBySheet: Record<string, string> = {
    SI: "Ing. de Sistemas",
    SW: "Ing. de Software",
    CC: "Ciencias de la Computación",
  };
  const workbook = XLSX.readFile(file);
  const courses: FisiCourse[] = [];
  const seen = new Set<string>();
  for (const sheet of workbook.SheetNames) {
    const school = schoolBySheet[sheet];
    if (!school) {
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {
      defval: "",
      header: 1,
    }) as unknown[][];
    for (const row of rows.slice(1)) {
      const rawCode = normalize(row[2]);
      const code = rawCode.replace(/\s+/g, "");
      const rawName = normalize(row[4]);
      if (!code || !rawName || rawCode === "Código" || code === "NR") {
        continue;
      }
      const id = `${sheet.toLowerCase()}-${slug(code)}`;
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      courses.push({
        id,
        code,
        name: titleCase(rawName),
        school,
        isThesis: /\bTESIS\b/i.test(rawName),
        cycle: Number(row[1]) || null,
        credits: Number(row[5]) || null,
        courseType: normalize(row[6]) || null,
        curriculum: sheet,
      });
    }
  }
  return courses;
}

function readTeachers(text: string): FisiTeacher[] {
  const teachers: FisiTeacher[] = [];
  for (const line of text.split(/\r?\n/)) {
    const emailMatch = line.match(/[a-z0-9._%+-]+@unmsm\.edu\.pe/i);
    if (!emailMatch) {
      continue;
    }
    const email = emailMatch[0].toLowerCase();
    const leftParts = line
      .slice(0, emailMatch.index)
      .trim()
      .split(/\s{2,}/)
      .filter(Boolean);
    const rightParts = line
      .slice((emailMatch.index ?? 0) + email.length)
      .trim()
      .split(/\s{2,}/)
      .filter(Boolean);
    let code = leftParts[1] ?? "";
    let paternal = leftParts[2] ?? "";
    let maternal = leftParts[3] ?? "";
    let names = leftParts[4] ?? "";
    const codeParts = code.split(/\s+/);
    if (codeParts.length > 1) {
      code = codeParts[0];
      paternal = codeParts.slice(1).join(" ");
      maternal = leftParts[2] ?? "";
      names = leftParts[3] ?? "";
    }
    if (!names && maternal) {
      names = maternal;
      maternal = "";
    }
    teachers.push({
      id: `doc-${slug(code)}`,
      teacherCode: code,
      name: titleCase([names, paternal, maternal].filter(Boolean).join(" ")),
      email,
      category: rightParts[0] ?? "",
      academicDegree: rightParts[1] ? titleCase(rightParts[1]) : "",
    });
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
