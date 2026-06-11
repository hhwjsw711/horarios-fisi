import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { neon } from "@neondatabase/serverless";
import { normalizeDepartment } from "../src/lib/domain/schedule-data";

type ImportTeacher = {
  id: string;
  teacherCode: string;
  name: string;
  email: string;
  category?: string;
  academicDegree?: string;
  department?: string;
};

type ClerkUser = {
  id: string;
  image_url?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  external_id?: string | null;
  email_addresses?: { email_address: string }[];
};

const args = process.argv.slice(2);
const source =
  valueAfter("--source") ?? args.find((arg) => !arg.startsWith("--"));
const sqlOut = valueAfter("--sql-out");
const apply = args.includes("--apply");
const school = normalizeDepartment(valueAfter("--school"));

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY is required.");
}
if (!source && !process.env.DATABASE_URL) {
  throw new Error("Use --source <import-json> or set DATABASE_URL.");
}
if (apply && !process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required with --apply.");
}

const teachers = source
  ? await readTeachersFromSource(source)
  : await readTeachersFromDatabase();
const existingUsers = await listClerkUsers();
const usersByEmail = new Map(
  existingUsers
    .map((user) => [primaryEmail(user), user] as const)
    .filter(([email]) => email),
);
const appUsers: {
  clerkUserId: string;
  email: string;
  imageUrl: string;
  name: string;
  teacherCode: string;
  teacherId: string;
  department: string;
}[] = [];
let created = 0;
let existing = 0;

for (const teacher of teachers) {
  const email = teacher.email.toLowerCase();
  let user = usersByEmail.get(email);
  if (!user) {
    user = await createClerkUser(teacher);
    usersByEmail.set(email, user);
    created += 1;
    process.stderr.write(`created ${email}\n`);
  } else {
    existing += 1;
    process.stderr.write(`exists ${email}\n`);
  }
  appUsers.push({
    clerkUserId: user.id,
    email,
    imageUrl: user.image_url ?? "",
    name: teacher.name,
    teacherCode: teacher.teacherCode,
    teacherId: teacher.id,
    department: normalizeDepartment(teacher.department ?? school),
  });
}

const sql = buildSql(appUsers);
if (apply) {
  await neon(process.env.DATABASE_URL ?? "").query(sql);
}
if (sqlOut) {
  await writeFile(sqlOut, sql);
}

console.log(
  JSON.stringify(
    {
      teachers: teachers.length,
      created,
      existing,
      sqlApplied: apply,
      sqlOut: sqlOut ?? null,
    },
    null,
    2,
  ),
);

function valueAfter(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

async function readTeachersFromSource(file: string): Promise<ImportTeacher[]> {
  const payload = JSON.parse(await readFile(file, "utf8")) as {
    teachers?: ImportTeacher[];
  };
  const teachers = payload.teachers ?? [];
  if (!teachers.length) {
    throw new Error("No teachers found in source.");
  }
  return teachers;
}

async function readTeachersFromDatabase(): Promise<ImportTeacher[]> {
  const sql = neon(process.env.DATABASE_URL ?? "");
  return (await sql.query(
    `
      select id, teacher_code as "teacherCode", name, email, category, academic_degree as "academicDegree", department
      from teacher_profiles
      where teacher_code is not null and email <> ''
      order by name asc
    `,
  )) as ImportTeacher[];
}

async function listClerkUsers() {
  const users: ClerkUser[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(
      `https://api.clerk.com/v1/users?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Clerk users list failed: ${response.status}`);
    }
    const page = (await response.json()) as ClerkUser[];
    users.push(...page);
    if (page.length < 100) {
      return users;
    }
  }
}

async function createClerkUser(teacher: ImportTeacher) {
  const [firstName, lastName] = splitName(teacher.name);
  const payload = {
    email_address: [teacher.email.toLowerCase()],
    first_name: firstName,
    last_name: lastName,
    external_id: teacher.id,
    skip_password_requirement: true,
    public_metadata: {
      role: "docente",
      school: normalizeDepartment(teacher.department ?? school),
      teacherCode: teacher.teacherCode,
    },
    private_metadata: {
      teacherId: teacher.id,
      source: "fisi-padron-2026-06-04",
    },
  };
  return clerkApi("/users", payload);
}

async function clerkApi(endpoint: string, body: unknown): Promise<ClerkUser> {
  const process = spawn(
    "clerk",
    ["api", endpoint, "-d", JSON.stringify(body), "--yes"],
    {
      env: processEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    text(process.stdout),
    text(process.stderr),
    new Promise<number | null>((resolve) => process.on("close", resolve)),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr || stdout || `clerk api ${endpoint} failed`);
  }
  return JSON.parse(stdout) as ClerkUser;
}

function processEnv() {
  return {
    ...process.env,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY ?? "",
  };
}

function primaryEmail(user: ClerkUser) {
  return user.email_addresses?.[0]?.email_address.toLowerCase() ?? "";
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 2) {
    return [parts[0] ?? "", parts.slice(1).join(" ")];
  }
  return [parts.slice(0, -2).join(" "), parts.slice(-2).join(" ")];
}

function buildSql(
  users: {
    clerkUserId: string;
    email: string;
    imageUrl: string;
    name: string;
    teacherCode: string;
    teacherId: string;
    department: string;
  }[],
) {
  const values = users
    .map(
      (user) =>
        `(${sqlString(user.clerkUserId)}, ${sqlString(user.email)}, ${sqlString(
          user.name,
        )}, ${sqlString(user.imageUrl)}, 'docente', ${sqlString(user.department)}, ${sqlString(
          user.teacherCode,
        )}, ${sqlString(user.teacherId)})`,
    )
    .join(",\n");
  return `
with imported(clerk_user_id, email, name, image_url, role, school, code, teacher_id) as (
  values
${values}
),
upserted_users as (
  insert into app_users (clerk_user_id, email, name, image_url, role, school, code)
  select clerk_user_id, email, name, image_url, role, school, code
  from imported
  on conflict (clerk_user_id) do update set
    email = excluded.email,
    name = excluded.name,
    image_url = excluded.image_url,
    role = excluded.role,
    school = excluded.school,
    code = excluded.code,
    updated_at = now()
  returning clerk_user_id
)
update teacher_profiles tp
set clerk_user_id = imported.clerk_user_id,
    updated_at = now()
from imported
where tp.id = imported.teacher_id
  and (tp.clerk_user_id is null or tp.clerk_user_id = imported.clerk_user_id);
`.trim();
}

function sqlString(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}
