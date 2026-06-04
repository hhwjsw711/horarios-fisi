import { neon } from "@neondatabase/serverless";
import {
  type ContractKey,
  contractRules,
  courseCatalog,
  type DayKey,
  days,
  hours,
  schools,
  seedTeachers,
  slotKey,
  type TeacherProfile,
} from "@/lib/schedule-data";

export type AppRole = "docente" | "direccion";

export type Onboarding = {
  role: AppRole;
  school: string;
  code: string;
  complete: boolean;
};

export type ScheduleIdentity = {
  clerkUserId: string;
  email: string;
  name: string;
  preview?: boolean;
};

export type SchedulePayload = {
  profile: TeacherProfile;
  teachers: TeacherProfile[];
  onboarding: Onboarding;
  canUseDirection: boolean;
  userName: string;
};

export class ScheduleError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

type AppUserRow = {
  clerk_user_id: string;
  email: string;
  name: string;
  role: AppRole;
  school: string;
  code: string;
};

type TeacherRow = {
  id: string;
  name: string;
  email: string;
  contract: ContractKey;
  status: TeacherProfile["status"];
  submitted_at: string | null;
};

type CourseRow = {
  id: string;
  name: string;
  school: string;
  is_thesis: boolean;
};

type AvailabilityRow = {
  day_key: DayKey;
  hour: number;
};

let seedReady: Promise<void> | undefined;

function getSql() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }
  return neon(databaseUrl);
}

export async function ensureScheduleSchema() {
  const sql = getSql();
  await sql.query(`
    create table if not exists app_users (
      clerk_user_id text primary key,
      email text not null,
      name text not null,
      role text not null default 'docente' check (role in ('docente', 'direccion')),
      school text not null default 'Ing. de Sistemas',
      code text not null default '',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists teacher_profiles (
      id text primary key,
      clerk_user_id text unique references app_users(clerk_user_id) on delete set null,
      name text not null,
      email text not null,
      contract text not null check (contract in ('full', 'partial20', 'partial10')),
      status text not null default 'borrador' check (status in ('enviado', 'borrador', 'observado')),
      submitted_at text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists courses (
      id text primary key,
      name text not null,
      school text not null,
      is_thesis boolean not null default false
    )
  `);
  await sql.query(`
    create table if not exists teacher_availability (
      teacher_id text not null references teacher_profiles(id) on delete cascade,
      day_key text not null,
      hour int not null,
      primary key (teacher_id, day_key, hour)
    )
  `);
  await sql.query(`
    create table if not exists teacher_courses (
      teacher_id text not null references teacher_profiles(id) on delete cascade,
      course_id text not null references courses(id) on delete restrict,
      position int not null default 0,
      primary key (teacher_id, course_id)
    )
  `);
}

export async function seedScheduleData() {
  const sql = getSql();
  await ensureScheduleSchema();
  for (const course of courseCatalog) {
    await sql.query(
      `
        insert into courses (id, name, school, is_thesis)
        values ($1, $2, $3, $4)
        on conflict (id) do update set
          name = excluded.name,
          school = excluded.school,
          is_thesis = excluded.is_thesis
      `,
      [course.id, course.name, course.school, Boolean(course.isThesis)],
    );
  }
  for (const teacher of seedTeachers) {
    await sql.query(
      `
        insert into teacher_profiles (id, name, email, contract, status, submitted_at)
        values ($1, $2, $3, $4, $5, $6)
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          contract = excluded.contract,
          status = excluded.status,
          submitted_at = excluded.submitted_at,
          updated_at = now()
      `,
      [
        teacher.id,
        teacher.name,
        teacher.email,
        teacher.contract,
        teacher.status,
        teacher.submittedAt ?? null,
      ],
    );
    await replaceAvailability(teacher.id, teacher.availability);
    await replaceCourses(
      teacher.id,
      teacher.courses.map((course) => course.id),
    );
  }
}

export async function getSchedulePayload(
  identity: ScheduleIdentity,
): Promise<SchedulePayload> {
  await ensureSeeded();
  const user = identity.preview
    ? previewUser(identity)
    : await ensureUser(identity);
  const profileId = identity.preview ? "me" : identity.clerkUserId;
  const profile = await ensureTeacherProfile(profileId, identity);
  const teachers =
    user.role === "direccion" ? await readTeachers(profile.id) : [profile];
  return {
    profile,
    teachers,
    onboarding: {
      role: user.role,
      school: user.school,
      code: user.code,
      complete: user.code.trim().length > 0,
    },
    canUseDirection: user.role === "direccion",
    userName: user.name,
  };
}

export async function completeOnboarding(
  identity: ScheduleIdentity,
  onboarding: Omit<Onboarding, "complete">,
) {
  const validated = validateOnboarding(identity, onboarding);
  const sql = getSql();
  await ensureUser(identity);
  await sql.query(
    `
      update app_users
      set role = $2, school = $3, code = $4, updated_at = now()
      where clerk_user_id = $1
    `,
    [identity.clerkUserId, validated.role, validated.school, validated.code],
  );
  return getSchedulePayload(identity);
}

export async function setContract(
  identity: ScheduleIdentity,
  contract: ContractKey,
) {
  const sql = getSql();
  const profileId = await getProfileId(identity);
  await sql.query(
    `
      update teacher_profiles
      set contract = $2, status = 'borrador', updated_at = now()
      where id = $1
    `,
    [profileId, contract],
  );
  return getSchedulePayload(identity);
}

export async function setAvailability(
  identity: ScheduleIdentity,
  availability: string[],
) {
  const profileId = await getProfileId(identity);
  await replaceAvailability(profileId, normalizeAvailability(availability));
  const sql = getSql();
  await sql.query(
    "update teacher_profiles set status = 'borrador', updated_at = now() where id = $1",
    [profileId],
  );
  return getSchedulePayload(identity);
}

export async function addCourse(identity: ScheduleIdentity, courseId: string) {
  const sql = getSql();
  const profileId = await getProfileId(identity);
  const course = courseCatalog.find((item) => item.id === courseId);
  if (!course) {
    throw new ScheduleError("Curso no válido.");
  }
  const profile = await readTeacher(profileId);
  const alreadySelected = profile.courses.some((item) => item.id === courseId);
  const countedCourses = profile.courses.filter(
    (item) => !item.isThesis,
  ).length;
  if (
    !alreadySelected &&
    !course.isThesis &&
    countedCourses >= contractRules[profile.contract].maxCourses
  ) {
    throw new ScheduleError("Ya alcanzaste el máximo de cursos permitido.");
  }
  await sql.query(
    `
      insert into teacher_courses (teacher_id, course_id, position)
      values (
        $1,
        $2,
        coalesce((select max(position) + 1 from teacher_courses where teacher_id = $1), 1)
      )
      on conflict (teacher_id, course_id) do nothing
    `,
    [profileId, courseId],
  );
  await sql.query(
    "update teacher_profiles set status = 'borrador', updated_at = now() where id = $1",
    [profileId],
  );
  return getSchedulePayload(identity);
}

export async function removeCourse(
  identity: ScheduleIdentity,
  courseId: string,
) {
  const sql = getSql();
  const profileId = await getProfileId(identity);
  await sql.query(
    "delete from teacher_courses where teacher_id = $1 and course_id = $2",
    [profileId, courseId],
  );
  await sql.query(
    "update teacher_profiles set status = 'borrador', updated_at = now() where id = $1",
    [profileId],
  );
  return getSchedulePayload(identity);
}

export async function submitSchedule(identity: ScheduleIdentity) {
  const sql = getSql();
  const profileId = await getProfileId(identity);
  const profile = await readTeacher(profileId);
  if (!teacherMeetsRules(profile)) {
    throw new ScheduleError("Aún faltan reglas por completar.");
  }
  const submittedAt = new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
  await sql.query(
    `
      update teacher_profiles
      set status = 'enviado', submitted_at = $2, updated_at = now()
      where id = $1
    `,
    [profileId, submittedAt],
  );
  return getSchedulePayload(identity);
}

function teacherMeetsRules(profile: TeacherProfile) {
  const rule = contractRules[profile.contract];
  const byDay = new Map<DayKey, number[]>();
  for (const key of profile.availability) {
    const [day, hour] = key.split("-");
    const current = byDay.get(day as DayKey) ?? [];
    current.push(Number(hour));
    byDay.set(day as DayKey, current);
  }
  const blockDays = Array.from(byDay.values()).filter(
    (values) => maxConsecutive(values) >= 4,
  ).length;
  const countedCourses = profile.courses.filter(
    (course) => !course.isThesis,
  ).length;
  return (
    profile.availability.length >= rule.requiredHours &&
    blockDays >= rule.requiredBlockDays &&
    countedCourses > 0 &&
    countedCourses <= rule.maxCourses
  );
}

function maxConsecutive(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  let max = 0;
  let current = 0;
  let previous = Number.NaN;
  for (const value of sorted) {
    current = value === previous + 1 ? current + 1 : 1;
    max = Math.max(max, current);
    previous = value;
  }
  return max;
}

async function ensureSeeded() {
  seedReady ??= prepareScheduleData().catch((error) => {
    seedReady = undefined;
    throw error;
  });
  await seedReady;
}

async function prepareScheduleData() {
  const sql = getSql();
  await ensureScheduleSchema();
  const rows = (await sql.query(
    "select count(*)::int as count from courses",
  )) as {
    count: number;
  }[];
  if (Number(rows[0]?.count ?? 0) === 0) {
    await seedScheduleData();
  }
}

function validateOnboarding(
  identity: ScheduleIdentity,
  onboarding: Omit<Onboarding, "complete">,
) {
  if (!schools.includes(onboarding.school)) {
    throw new ScheduleError("Escuela no válida.");
  }
  if (onboarding.code.trim().length < 4) {
    throw new ScheduleError("Código institucional no válido.");
  }
  if (onboarding.role === "docente") {
    return {
      role: onboarding.role,
      school: onboarding.school,
      code: onboarding.code.trim(),
    };
  }
  const directorCode = process.env.DIRECTION_ACCESS_CODE?.trim();
  const emailIsAllowed = getDirectionEmailAllowlist().has(
    identity.email.toLowerCase(),
  );
  const codeIsValid = Boolean(
    directorCode && onboarding.code.trim() === directorCode,
  );
  if (!emailIsAllowed && !codeIsValid) {
    throw new ScheduleError("Código de Dirección inválido.", 403);
  }
  return {
    role: onboarding.role,
    school: onboarding.school,
    code: emailIsAllowed ? onboarding.code.trim() : "DIRECCION",
  };
}

function getDirectionEmailAllowlist() {
  return new Set(
    (process.env.DIRECTION_EMAIL_ALLOWLIST ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

function normalizeAvailability(availability: string[]) {
  const allowedDays = new Set(days.map((day) => day.key));
  const allowedHours = new Set(hours);
  const normalized = new Set<string>();
  for (const key of availability) {
    const [day, rawHour] = key.split("-");
    const hour = Number(rawHour);
    if (allowedDays.has(day as DayKey) && allowedHours.has(hour)) {
      normalized.add(slotKey(day as DayKey, hour));
    }
  }
  return Array.from(normalized).sort();
}

function previewUser(identity: ScheduleIdentity): AppUserRow {
  return {
    clerk_user_id: identity.clerkUserId,
    email: identity.email,
    name: identity.name,
    role: "direccion",
    school: "Ing. de Sistemas",
    code: "PREVIEW",
  };
}

async function ensureUser(identity: ScheduleIdentity) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      insert into app_users (clerk_user_id, email, name)
      values ($1, $2, $3)
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        name = excluded.name,
        updated_at = now()
      returning clerk_user_id, email, name, role, school, code
    `,
    [identity.clerkUserId, identity.email, identity.name],
  )) as AppUserRow[];
  return rows[0];
}

async function ensureTeacherProfile(
  profileId: string,
  identity: ScheduleIdentity,
) {
  if (identity.preview) {
    return readTeacher(profileId);
  }
  const sql = getSql();
  await sql.query(
    `
      insert into teacher_profiles (id, clerk_user_id, name, email, contract, status)
      values ($1, $1, $2, $3, 'full', 'borrador')
      on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        updated_at = now()
    `,
    [profileId, identity.name, identity.email],
  );
  const availabilityCount = (await sql.query(
    "select count(*)::int as count from teacher_availability where teacher_id = $1",
    [profileId],
  )) as { count: number }[];
  if (Number(availabilityCount[0]?.count ?? 0) === 0) {
    await replaceAvailability(profileId, seedTeachers[0].availability);
  }
  const courseCount = (await sql.query(
    "select count(*)::int as count from teacher_courses where teacher_id = $1",
    [profileId],
  )) as { count: number }[];
  if (Number(courseCount[0]?.count ?? 0) === 0) {
    await replaceCourses(
      profileId,
      seedTeachers[0].courses.map((course) => course.id),
    );
  }
  return readTeacher(profileId);
}

async function getProfileId(identity: ScheduleIdentity) {
  await ensureSeeded();
  if (identity.preview) {
    return "me";
  }
  await ensureUser(identity);
  await ensureTeacherProfile(identity.clerkUserId, identity);
  return identity.clerkUserId;
}

async function readTeachers(currentId: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, name, email, contract, status, submitted_at
      from teacher_profiles
      order by case when id = $1 then 0 else 1 end, name asc
    `,
    [currentId],
  )) as TeacherRow[];
  return Promise.all(rows.map((row) => inflateTeacher(row)));
}

async function readTeacher(id: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, name, email, contract, status, submitted_at
      from teacher_profiles
      where id = $1
      limit 1
    `,
    [id],
  )) as TeacherRow[];
  if (!rows[0]) {
    throw new Error("Teacher profile not found.");
  }
  return inflateTeacher(rows[0]);
}

async function inflateTeacher(row: TeacherRow): Promise<TeacherProfile> {
  const sql = getSql();
  const courseRows = (await sql.query(
    `
      select c.id, c.name, c.school, c.is_thesis
      from teacher_courses tc
      join courses c on c.id = tc.course_id
      where tc.teacher_id = $1
      order by tc.position asc, c.name asc
    `,
    [row.id],
  )) as CourseRow[];
  const availabilityRows = (await sql.query(
    `
      select day_key, hour
      from teacher_availability
      where teacher_id = $1
      order by day_key asc, hour asc
    `,
    [row.id],
  )) as AvailabilityRow[];
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    contract: row.contract,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    courses: courseRows.map((course) => ({
      id: course.id,
      name: course.name,
      school: course.school,
      isThesis: course.is_thesis,
    })),
    availability: availabilityRows.map((item) =>
      slotKey(item.day_key, item.hour),
    ),
  };
}

async function replaceAvailability(teacherId: string, availability: string[]) {
  const sql = getSql();
  await sql.query("delete from teacher_availability where teacher_id = $1", [
    teacherId,
  ]);
  const rows = availability
    .map((key) => {
      const [day, hour] = key.split("-");
      return { day, hour: Number(hour) };
    })
    .filter((item) => item.day && Number.isFinite(item.hour));
  if (!rows.length) {
    return;
  }
  const params: Array<string | number> = [];
  const values = rows
    .map((item, index) => {
      params.push(teacherId, item.day, item.hour);
      const start = index * 3;
      return `($${start + 1}, $${start + 2}, $${start + 3})`;
    })
    .join(", ");
  await sql.query(
    `
      insert into teacher_availability (teacher_id, day_key, hour)
      values ${values}
      on conflict do nothing
    `,
    params,
  );
}

async function replaceCourses(teacherId: string, courseIds: string[]) {
  const sql = getSql();
  await sql.query("delete from teacher_courses where teacher_id = $1", [
    teacherId,
  ]);
  for (const [index, courseId] of courseIds.entries()) {
    await sql.query(
      `
        insert into teacher_courses (teacher_id, course_id, position)
        values ($1, $2, $3)
        on conflict (teacher_id, course_id) do update set position = excluded.position
      `,
      [teacherId, courseId, index + 1],
    );
  }
}
