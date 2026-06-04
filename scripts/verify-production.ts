import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { verifyScheduleSchema } from "../src/lib/schedule-db";

type Check = {
  name: string;
  ok: boolean;
  detail?: string | number | boolean;
};

type Counts = {
  app_users: number;
  direction_users: number;
  teacher_profiles: number;
  linked_teachers: number;
  active_courses: number;
  inactive_courses: number;
  teacher_courses: number;
  availability_slots: number;
  schedule_events: number;
  invalid_availability: number;
  invalid_teacher_courses: number;
  over_quota_teachers: number;
};

const args = process.argv.slice(1);
const envFile =
  readArg("--vercel-env-file") ??
  readArg("--env-file") ??
  process.env.VERIFY_ENV_FILE;
if (envFile) {
  loadEnvFile(envFile);
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error("Env file did not provide DATABASE_URL.");
  }
}

const baseUrl = (
  readArg("--base-url") ??
  process.env.VERIFY_BASE_URL ??
  "https://horarios-unmsm.vercel.app"
).replace(/\/$/, "");
const minTeachers = readNumberArg("--min-teachers", 1);
const minLinkedTeachers = readNumberArg("--min-linked-teachers", 0);
const minActiveCourses = readNumberArg("--min-active-courses", 1);

const envChecks: Check[] = [
  hasEnv("DATABASE_URL"),
  hasEnv("CLERK_SECRET_KEY"),
  hasEnv("CLERK_WEBHOOK_SIGNING_SECRET"),
  hasEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY"),
];

const publicChecks = await verifyPublicRoutes(baseUrl);
const schema = await verifyScheduleSchema();
const schemaChecks = Object.entries(schema).map(([name, ok]) => ({
  name: `schema.${name}`,
  ok,
}));
const counts = await readCounts();
const dataChecks: Check[] = [
  {
    name: "data.has_direction_user",
    ok: counts.direction_users >= 1,
    detail: counts.direction_users,
  },
  {
    name: "data.has_min_teachers",
    ok: counts.teacher_profiles >= minTeachers,
    detail: counts.teacher_profiles,
  },
  {
    name: "data.has_min_linked_teachers",
    ok: counts.linked_teachers >= minLinkedTeachers,
    detail: counts.linked_teachers,
  },
  {
    name: "data.has_active_courses",
    ok: counts.active_courses >= minActiveCourses,
    detail: counts.active_courses,
  },
  {
    name: "data.valid_availability_grid",
    ok: counts.invalid_availability === 0,
    detail: counts.invalid_availability,
  },
  {
    name: "data.valid_teacher_course_refs",
    ok: counts.invalid_teacher_courses === 0,
    detail: counts.invalid_teacher_courses,
  },
  {
    name: "data.course_quota_invariants",
    ok: counts.over_quota_teachers === 0,
    detail: counts.over_quota_teachers,
  },
];
const warnings: Check[] = [
  {
    name: "warning.no_teacher_courses_assigned",
    ok: counts.teacher_courses > 0,
    detail: counts.teacher_courses,
  },
  {
    name: "warning.no_availability_marked",
    ok: counts.availability_slots > 0,
    detail: counts.availability_slots,
  },
  {
    name: "warning.no_audit_events",
    ok: counts.schedule_events > 0,
    detail: counts.schedule_events,
  },
].filter((check) => !check.ok);

const checks = [...envChecks, ...publicChecks, ...schemaChecks, ...dataChecks];
const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  baseUrl,
  thresholds: {
    minTeachers,
    minLinkedTeachers,
    minActiveCourses,
  },
  counts,
  failed,
  warnings,
  checks,
};

console.log(JSON.stringify(result, null, 2));

if (failed.length) {
  throw new Error("Production verification failed.");
}

function readArg(name: string) {
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      return args[index + 1];
    }
  }
  return undefined;
}

function readNumberArg(name: string, fallback: number) {
  const raw = readArg(name) ?? process.env[nameToEnv(name)];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }
  return value;
}

function nameToEnv(name: string) {
  return `VERIFY_${name.replace(/^--/, "").replaceAll("-", "_").toUpperCase()}`;
}

function hasEnv(name: string): Check {
  return {
    name: `env.${name}`,
    ok: Boolean(process.env[name]?.trim()),
  };
}

function loadEnvFile(path: string) {
  const body = readFileSync(path, "utf8");
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replaceAll('\\"', '"').replaceAll("\\n", "\n");
  }
  return value;
}

async function verifyPublicRoutes(base: string): Promise<Check[]> {
  const routes = [
    { path: "/sign-in", status: 200 },
    { path: "/api/schedule", status: 401 },
    { path: "/direccion", status: 307, location: "/sign-in" },
    { path: "/direccion/usuarios", status: 307, location: "/sign-in" },
    { path: "/direccion/auditoria", status: 307, location: "/sign-in" },
    { path: "/direccion/configuracion", status: 307, location: "/sign-in" },
  ];
  const checks: Check[] = [];
  for (const route of routes) {
    const response = await fetch(`${base}${route.path}`, {
      redirect: "manual",
    });
    const location = response.headers.get("location");
    checks.push({
      name: `http.${route.path}`,
      ok:
        response.status === route.status &&
        (!route.location || location === route.location),
      detail: `${response.status}${location ? ` ${location}` : ""}`,
    });
  }
  return checks;
}

async function readCounts(): Promise<Counts> {
  const sql = neon(process.env.DATABASE_URL ?? "");
  const rows = (await sql.query(`
    with teacher_course_counts as (
      select
        tp.id,
        tp.contract,
        count(tc.course_id) filter (where coalesce(c.is_thesis, false) = false)::int as counted_courses
      from teacher_profiles tp
      left join teacher_courses tc on tc.teacher_id = tp.id
      left join courses c on c.id = tc.course_id
      group by tp.id, tp.contract
    )
    select
      (select count(*)::int from app_users) as app_users,
      (select count(*)::int from app_users where role = 'direccion') as direction_users,
      (select count(*)::int from teacher_profiles) as teacher_profiles,
      (select count(*)::int from teacher_profiles where clerk_user_id is not null) as linked_teachers,
      (select count(*)::int from courses where active = true) as active_courses,
      (select count(*)::int from courses where active = false) as inactive_courses,
      (select count(*)::int from teacher_courses) as teacher_courses,
      (select count(*)::int from teacher_availability) as availability_slots,
      (select count(*)::int from schedule_events) as schedule_events,
      (
        select count(*)::int
        from teacher_availability
        where day_key not in ('lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado')
          or hour < 8
          or hour > 21
      ) as invalid_availability,
      (
        select count(*)::int
        from teacher_courses tc
        left join teacher_profiles tp on tp.id = tc.teacher_id
        left join courses c on c.id = tc.course_id
        where tp.id is null or c.id is null
      ) as invalid_teacher_courses,
      (
        select count(*)::int
        from teacher_course_counts
        where (contract = 'full' and counted_courses > 3)
          or (contract = 'partial20' and counted_courses > 2)
          or (contract = 'partial10' and counted_courses > 1)
      ) as over_quota_teachers
  `)) as Counts[];
  return rows[0];
}
