import { neon } from "@neondatabase/serverless";
import {
  type ContractKey,
  type Course,
  courseCatalog,
  type DayKey,
  days,
  hours,
  schools,
  seedTeachers,
  slotKey,
  type TeacherProfile,
} from "@/lib/schedule-data";
import {
  courseAssignmentState,
  validateTeacherRules,
} from "@/lib/schedule-rules";

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
  currentUserId: string;
  profile: TeacherProfile;
  teachers: TeacherProfile[];
  users: ScheduleUser[];
  catalog: Course[];
  schools: string[];
  settings: ScheduleSettings;
  events: ScheduleEvent[];
  onboarding: Onboarding;
  canUseDirection: boolean;
  userName: string;
};

export type ScheduleSettings = {
  academicTerm: string;
  periodClosed: boolean;
  periodClosedAt?: string;
};

export type ScheduleEvent = {
  id: number;
  teacherId: string;
  actorUserId: string;
  actorName: string;
  eventType: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ScheduleUser = {
  clerkUserId: string;
  email: string;
  name: string;
  role: AppRole;
  school: string;
  onboardingComplete: boolean;
  teacherStatus: TeacherProfile["status"] | null;
  updatedAt: string;
  createdAt: string;
};

export type ClerkUserSyncInput = {
  clerkUserId: string;
  email: string;
  name: string;
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
  created_at?: string;
  updated_at?: string;
  teacher_status?: TeacherProfile["status"] | null;
};

type TeacherRow = {
  id: string;
  teacher_code: string | null;
  name: string;
  email: string;
  contract: ContractKey;
  status: TeacherProfile["status"];
  category: string | null;
  academic_degree: string | null;
  review_note: string;
  submitted_at: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

type CourseRow = {
  id: string;
  code: string | null;
  name: string;
  school: string;
  active: boolean;
  cycle: number | null;
  credits: number | null;
  course_type: string | null;
  curriculum: string | null;
  is_thesis: boolean;
};

type CourseInput = {
  name: string;
  school: string;
  isThesis: boolean;
};

type AvailabilityRow = {
  day_key: DayKey;
  hour: number;
};

type ScheduleEventRow = {
  id: number;
  teacher_id: string;
  actor_user_id: string;
  actor_name: string | null;
  event_type: string;
  metadata: Record<string, unknown> | string;
  created_at: string;
};

const defaultAcademicTerm = "2026.2";

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
      status text not null default 'borrador',
      review_note text not null default '',
      submitted_at text,
      approved_at text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists courses (
      id text primary key,
      name text not null,
      school text not null,
      active boolean not null default true,
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
  await sql.query(`
    create table if not exists app_settings (
      key text primary key,
      value text not null,
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists schedule_events (
      id bigserial primary key,
      teacher_id text not null,
      actor_user_id text not null,
      event_type text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await sql.query(
    "alter table teacher_profiles add column if not exists review_note text not null default ''",
  );
  await sql.query(
    "alter table teacher_profiles add column if not exists approved_at text",
  );
  await sql.query(
    "alter table teacher_profiles add column if not exists teacher_code text",
  );
  await sql.query(
    "alter table teacher_profiles add column if not exists category text",
  );
  await sql.query(
    "alter table teacher_profiles add column if not exists academic_degree text",
  );
  await sql.query(
    "alter table teacher_profiles drop constraint if exists teacher_profiles_status_check",
  );
  await sql.query(
    "alter table teacher_profiles add constraint teacher_profiles_status_check check (status in ('enviado', 'borrador', 'observado', 'aprobado'))",
  );
  await sql.query(
    "alter table courses add column if not exists active boolean not null default true",
  );
  await sql.query("alter table courses add column if not exists code text");
  await sql.query("alter table courses add column if not exists cycle int");
  await sql.query("alter table courses add column if not exists credits int");
  await sql.query(
    "alter table courses add column if not exists course_type text",
  );
  await sql.query(
    "alter table courses add column if not exists curriculum text",
  );
  await sql.query(
    "insert into app_settings (key, value) values ('academic_term', $1) on conflict (key) do nothing",
    [defaultAcademicTerm],
  );
  await sql.query(
    "insert into app_settings (key, value) values ('period_closed', 'false') on conflict (key) do nothing",
  );
}

export async function verifyScheduleSchema() {
  const sql = getSql();
  const columns = (await sql.query(
    `
      select column_name
      from information_schema.columns
      where table_name = 'teacher_profiles'
        and column_name in ('approved_at', 'review_note', 'submitted_at')
      order by column_name
    `,
  )) as { column_name: string }[];
  const constraints = (await sql.query(
    `
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'teacher_profiles_status_check'
      limit 1
    `,
  )) as { definition: string }[];
  const settings = (await sql.query(
    "select key from app_settings where key in ('academic_term', 'period_closed') order by key",
  )) as { key: string }[];
  const columnNames = new Set(columns.map((row) => row.column_name));
  const settingKeys = new Set(settings.map((row) => row.key));
  const statusConstraint = constraints[0]?.definition ?? "";
  return {
    approvedAtColumn: columnNames.has("approved_at"),
    reviewNoteColumn: columnNames.has("review_note"),
    submittedAtColumn: columnNames.has("submitted_at"),
    statusAllowsApproved: statusConstraint.includes("aprobado"),
    academicTermSetting: settingKeys.has("academic_term"),
    periodClosedSetting: settingKeys.has("period_closed"),
  };
}

export async function seedCourseCatalog() {
  const sql = getSql();
  await ensureScheduleSchema();
  for (const course of courseCatalog) {
    await sql.query(
      `
        insert into courses (id, code, name, school, is_thesis, cycle, credits, course_type, curriculum)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          code = excluded.code,
          name = excluded.name,
          school = excluded.school,
          is_thesis = excluded.is_thesis,
          cycle = excluded.cycle,
          credits = excluded.credits,
          course_type = excluded.course_type,
          curriculum = excluded.curriculum
      `,
      [
        course.id,
        course.code ?? course.id,
        course.name,
        course.school,
        Boolean(course.isThesis),
        course.cycle ?? null,
        course.credits ?? null,
        course.courseType ?? null,
        course.curriculum ?? null,
      ],
    );
  }
}

export async function seedScheduleData({
  includeDemoTeachers = false,
}: {
  includeDemoTeachers?: boolean;
} = {}) {
  const sql = getSql();
  await seedCourseCatalog();
  if (!includeDemoTeachers) {
    return;
  }
  for (const teacher of seedTeachers) {
    await sql.query(
      `
        insert into teacher_profiles (id, name, email, contract, status, review_note, submitted_at, approved_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8)
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          contract = excluded.contract,
          status = excluded.status,
          review_note = excluded.review_note,
          submitted_at = excluded.submitted_at,
          approved_at = excluded.approved_at,
          updated_at = now()
      `,
      [
        teacher.id,
        teacher.name,
        teacher.email,
        teacher.contract,
        teacher.status,
        teacher.reviewNote ?? "",
        teacher.submittedAt ?? null,
        teacher.approvedAt ?? null,
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
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureSeeded();
  const user = await ensureUser(identity);
  const profileId = identity.clerkUserId;
  const profile = await ensureTeacherProfile(profileId, identity);
  const catalog = await readCourseCatalog();
  const schoolOptions = await readSchools();
  const settings = await readSettings();
  const teachers = user.role === "direccion" ? await readTeachers() : [profile];
  const users = user.role === "direccion" ? await readUsers() : [];
  const events =
    user.role === "direccion"
      ? await readScheduleEvents()
      : await readScheduleEvents(profile.id);
  return {
    currentUserId: identity.clerkUserId,
    profile,
    teachers,
    users,
    catalog,
    schools: schoolOptions,
    settings,
    events,
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
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureSeeded();
  const validated = validateOnboarding(
    identity,
    onboarding,
    await readSchools(),
  );
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
  await recordEvent(identity, identity.clerkUserId, "onboarding.completed", {
    role: validated.role,
    school: validated.school,
  });
  return getSchedulePayload(identity);
}

export async function syncClerkUser(input: ClerkUserSyncInput) {
  await ensureSeeded();
  const sql = getSql();
  const officialRows = (await sql.query(
    `
      select teacher_code
      from teacher_profiles
      where lower(email) = lower($1)
      limit 1
    `,
    [input.email],
  )) as { teacher_code: string | null }[];
  const teacherCode = officialRows[0]?.teacher_code?.trim() ?? "";
  const rows = (await sql.query(
    `
      insert into app_users (clerk_user_id, email, name, school, code)
      values ($1, $2, $3, 'Ing. de Sistemas', $4)
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        name = excluded.name,
        code = case
          when app_users.code = '' and excluded.code <> '' then excluded.code
          else app_users.code
        end,
        updated_at = case
          when app_users.email is distinct from excluded.email
            or app_users.name is distinct from excluded.name
            or (app_users.code = '' and excluded.code <> '')
          then now()
          else app_users.updated_at
        end
      returning clerk_user_id
    `,
    [input.clerkUserId, input.email, input.name, teacherCode],
  )) as { clerk_user_id: string }[];
  await sql.query(
    `
      update teacher_profiles
      set clerk_user_id = $1,
          updated_at = case
            when clerk_user_id is distinct from $1 then now()
            else updated_at
          end
      where lower(email) = lower($2)
        and (clerk_user_id is null or clerk_user_id = $1)
    `,
    [input.clerkUserId, input.email],
  );
  return rows[0];
}

export async function deleteClerkUser(clerkUserId: string) {
  await ensureSeeded();
  const sql = getSql();
  await sql.query("delete from app_users where clerk_user_id = $1", [
    clerkUserId,
  ]);
  return { clerkUserId };
}

export async function setContract(
  identity: ScheduleIdentity,
  contract: ContractKey,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensurePeriodOpen();
  const sql = getSql();
  const profileId = await getProfileId(identity);
  await sql.query(
    `
      update teacher_profiles
      set contract = $2, status = 'borrador', review_note = '', approved_at = null, updated_at = now()
      where id = $1
    `,
    [profileId, contract],
  );
  await recordEvent(identity, profileId, "teacher.contract_changed", {
    contract,
  });
  return getSchedulePayload(identity);
}

export async function setAvailability(
  identity: ScheduleIdentity,
  availability: string[],
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensurePeriodOpen();
  const profileId = await getProfileId(identity);
  await replaceAvailability(profileId, normalizeAvailability(availability));
  const sql = getSql();
  await sql.query(
    "update teacher_profiles set status = 'borrador', review_note = '', approved_at = null, updated_at = now() where id = $1",
    [profileId],
  );
  await recordEvent(identity, profileId, "teacher.availability_changed", {
    slots: normalizeAvailability(availability).length,
  });
  return getSchedulePayload(identity);
}

export async function addCourse(identity: ScheduleIdentity, courseId: string) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  const profileId = await getProfileId(identity);
  return addCourseToTeacher(
    identity,
    profileId,
    courseId,
    "teacher.course_added",
  );
}

export async function assignTeacherCourse(
  identity: ScheduleIdentity,
  teacherId: string,
  courseId: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  return addCourseToTeacher(
    identity,
    teacherId,
    courseId,
    "director.course_assigned",
  );
}

async function addCourseToTeacher(
  identity: ScheduleIdentity,
  teacherId: string,
  courseId: string,
  eventType: string,
) {
  await ensurePeriodOpen();
  const sql = getSql();
  const course = await readCourse(courseId);
  if (!course) {
    throw new ScheduleError("Curso no válido.");
  }
  const profile = await readTeacher(teacherId);
  const assignment = courseAssignmentState(profile, mapCourseRow(course));
  if (assignment.limitReached) {
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
    [teacherId, courseId],
  );
  if (!assignment.alreadyAssigned) {
    await markTeacherDraft(teacherId);
    await recordEvent(identity, teacherId, eventType, {
      courseId,
      courseName: course.name,
    });
  }
  return getSchedulePayload(identity);
}

export async function createCourse(
  identity: ScheduleIdentity,
  input: CourseInput,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  const name = input.name.trim();
  const school = input.school.trim();
  if (name.length < 3 || school.length < 3) {
    throw new ScheduleError("Curso y escuela son obligatorios.");
  }
  const id = slugifyCourseId(`${school}-${name}`);
  const sql = getSql();
  await sql.query(
    `
      insert into courses (id, name, school, active, is_thesis)
      values ($1, $2, $3, true, $4)
      on conflict (id) do update set
        name = excluded.name,
        school = excluded.school,
        active = true,
        is_thesis = excluded.is_thesis
    `,
    [id, name, school, input.isThesis],
  );
  await recordEvent(identity, id, "catalog.course_upserted", {
    name,
    school,
    isThesis: input.isThesis,
  });
  return getSchedulePayload(identity);
}

export async function setCourseActive(
  identity: ScheduleIdentity,
  courseId: string,
  active: boolean,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  const sql = getSql();
  const rows = (await sql.query(
    `
      update courses
      set active = $2
      where id = $1
      returning id
    `,
    [courseId, active],
  )) as { id: string }[];
  if (!rows[0]) {
    throw new ScheduleError("Curso no encontrado.", 404);
  }
  await recordEvent(identity, courseId, "catalog.course_status_changed", {
    active,
  });
  return getSchedulePayload(identity);
}

export async function setAcademicTerm(
  identity: ScheduleIdentity,
  academicTerm: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  const normalizedTerm = academicTerm.trim();
  if (normalizedTerm.length < 4 || normalizedTerm.length > 24) {
    throw new ScheduleError("Periodo académico no válido.");
  }
  const sql = getSql();
  await sql.query(
    `
      insert into app_settings (key, value, updated_at)
      values ('academic_term', $1, now())
      on conflict (key) do update set
        value = excluded.value,
        updated_at = now()
    `,
    [normalizedTerm],
  );
  await recordEvent(identity, "settings", "settings.academic_term_changed", {
    academicTerm: normalizedTerm,
  });
  return getSchedulePayload(identity);
}

export async function setUserAccess(
  identity: ScheduleIdentity,
  targetUserId: string,
  role: AppRole,
  school: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  const schools = await readSchools();
  if (!schools.includes(school)) {
    throw new ScheduleError("Escuela no válida.");
  }
  const sql = getSql();
  const rows = (await sql.query(
    "select clerk_user_id, role from app_users where clerk_user_id = $1 limit 1",
    [targetUserId],
  )) as Pick<AppUserRow, "clerk_user_id" | "role">[];
  const target = rows[0];
  if (!target) {
    throw new ScheduleError("Usuario no encontrado.", 404);
  }
  if (targetUserId === identity.clerkUserId && role !== "direccion") {
    throw new ScheduleError("No puedes retirar tu propio acceso.", 403);
  }
  if (target.role === "direccion" && role !== "direccion") {
    const directionRows = (await sql.query(
      "select count(*)::int as count from app_users where role = 'direccion' and clerk_user_id <> $1",
      [targetUserId],
    )) as { count: number }[];
    if (Number(directionRows[0]?.count ?? 0) === 0) {
      throw new ScheduleError("Debe quedar al menos un usuario Dirección.");
    }
  }
  await sql.query(
    `
      update app_users
      set role = $2,
          school = $3,
          code = case when $2 = 'direccion' and code = '' then 'DIRECCION' else code end,
          updated_at = now()
      where clerk_user_id = $1
    `,
    [targetUserId, role, school],
  );
  await recordEvent(identity, targetUserId, "access.user_updated", {
    role,
    school,
  });
  return getSchedulePayload(identity);
}

export async function removeCourse(
  identity: ScheduleIdentity,
  courseId: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  const profileId = await getProfileId(identity);
  return removeCourseFromTeacher(
    identity,
    profileId,
    courseId,
    "teacher.course_removed",
  );
}

export async function unassignTeacherCourse(
  identity: ScheduleIdentity,
  teacherId: string,
  courseId: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  return removeCourseFromTeacher(
    identity,
    teacherId,
    courseId,
    "director.course_unassigned",
  );
}

async function removeCourseFromTeacher(
  identity: ScheduleIdentity,
  teacherId: string,
  courseId: string,
  eventType: string,
) {
  await ensurePeriodOpen();
  await readTeacher(teacherId);
  const sql = getSql();
  const rows = (await sql.query(
    "delete from teacher_courses where teacher_id = $1 and course_id = $2 returning course_id",
    [teacherId, courseId],
  )) as { course_id: string }[];
  if (rows[0]) {
    await markTeacherDraft(teacherId);
    await recordEvent(identity, teacherId, eventType, {
      courseId,
    });
  }
  return getSchedulePayload(identity);
}

async function markTeacherDraft(teacherId: string) {
  const sql = getSql();
  await sql.query(
    "update teacher_profiles set status = 'borrador', review_note = '', approved_at = null, updated_at = now() where id = $1",
    [teacherId],
  );
}

export async function observeSchedule(
  identity: ScheduleIdentity,
  teacherId: string,
  note: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  await ensurePeriodOpen();
  const normalizedNote = note.trim();
  if (normalizedNote.length < 8) {
    throw new ScheduleError("Escribe una observación más específica.");
  }
  const sql = getSql();
  const rows = (await sql.query(
    `
      update teacher_profiles
      set status = 'observado', review_note = $2, approved_at = null, updated_at = now()
      where id = $1
      returning id
    `,
    [teacherId, normalizedNote],
  )) as { id: string }[];
  if (!rows[0]) {
    throw new ScheduleError("Docente no encontrado.", 404);
  }
  await recordEvent(identity, teacherId, "director.observed_schedule", {
    note: normalizedNote,
  });
  return getSchedulePayload(identity);
}

export async function approveSchedule(
  identity: ScheduleIdentity,
  teacherId: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  await ensurePeriodOpen();
  const profile = await readTeacher(teacherId);
  if (profile.status === "aprobado") {
    return getSchedulePayload(identity);
  }
  if (profile.status !== "enviado") {
    throw new ScheduleError("Solo puedes aprobar horarios enviados.");
  }
  if (!teacherMeetsRules(profile)) {
    throw new ScheduleError("El horario no cumple las reglas.");
  }
  const approvedAt = formatTimestamp();
  const sql = getSql();
  await sql.query(
    `
      update teacher_profiles
      set status = 'aprobado', review_note = '', approved_at = $2, updated_at = now()
      where id = $1
    `,
    [teacherId, approvedAt],
  );
  await recordEvent(identity, teacherId, "director.approved_schedule", {
    approvedAt,
  });
  return getSchedulePayload(identity);
}

export async function submitSchedule(identity: ScheduleIdentity) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensurePeriodOpen();
  const sql = getSql();
  const profileId = await getProfileId(identity);
  const profile = await readTeacher(profileId);
  if (!teacherMeetsRules(profile)) {
    throw new ScheduleError("Aún faltan reglas por completar.");
  }
  const submittedAt = formatTimestamp();
  await sql.query(
    `
      update teacher_profiles
      set status = 'enviado', review_note = '', submitted_at = $2, approved_at = null, updated_at = now()
      where id = $1
    `,
    [profileId, submittedAt],
  );
  await recordEvent(identity, profileId, "teacher.submitted_schedule", {
    submittedAt,
  });
  return getSchedulePayload(identity);
}

export async function setPeriodClosed(
  identity: ScheduleIdentity,
  closed: boolean,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureDirection(identity);
  const sql = getSql();
  if (closed) {
    const teachers = await readTeachers();
    if (!teachers.length) {
      throw new ScheduleError("No hay docentes para cerrar el periodo.");
    }
    const pending = teachers.filter((teacher) => teacher.status !== "aprobado");
    if (pending.length) {
      throw new ScheduleError("Aprueba todos los horarios antes de cerrar.");
    }
    const closedAt = formatTimestamp();
    await upsertSetting("period_closed", "true");
    await upsertSetting("period_closed_at", closedAt);
    await recordEvent(identity, "settings", "period.closed", { closedAt });
    return getSchedulePayload(identity);
  }
  await sql.query("delete from app_settings where key in ('period_closed_at')");
  await upsertSetting("period_closed", "false");
  await recordEvent(identity, "settings", "period.reopened", {});
  return getSchedulePayload(identity);
}

function teacherMeetsRules(profile: TeacherProfile) {
  return validateTeacherRules(profile).complete;
}

function formatTimestamp() {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date());
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
  if (process.env.NODE_ENV === "production") {
    const verification = await verifyScheduleSchema();
    const missing = Object.entries(verification)
      .filter(([, ready]) => !ready)
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(
        `Schedule database is not migrated: ${missing.join(", ")}.`,
      );
    }
  } else {
    await ensureScheduleSchema();
  }
  const rows = (await sql.query(
    "select count(*)::int as count from courses",
  )) as {
    count: number;
  }[];
  if (Number(rows[0]?.count ?? 0) === 0) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Schedule course catalog is empty.");
    }
    await seedCourseCatalog();
  }
}

async function ensureDirection(identity: ScheduleIdentity) {
  await ensureSeeded();
  const user = await ensureUser(identity);
  if (user.role !== "direccion") {
    throw new ScheduleError("No tienes acceso de Dirección.", 403);
  }
}

async function ensurePeriodOpen() {
  await ensureSeeded();
  const settings = await readSettings();
  if (settings.periodClosed) {
    throw new ScheduleError("El periodo académico está cerrado.", 403);
  }
}

async function upsertSetting(key: string, value: string) {
  const sql = getSql();
  await sql.query(
    `
      insert into app_settings (key, value, updated_at)
      values ($1, $2, now())
      on conflict (key) do update set
        value = excluded.value,
        updated_at = now()
    `,
    [key, value],
  );
}

function validateOnboarding(
  identity: ScheduleIdentity,
  onboarding: Omit<Onboarding, "complete">,
  availableSchools: string[],
) {
  if (!availableSchools.includes(onboarding.school)) {
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

async function readCourseCatalog() {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, code, name, school, active, cycle, credits, course_type, curriculum, is_thesis
      from courses
      order by active desc, school asc, name asc
    `,
  )) as CourseRow[];
  return rows.map((course) => ({
    id: course.id,
    code: course.code ?? undefined,
    name: course.name,
    school: course.school,
    active: course.active,
    cycle: course.cycle,
    credits: course.credits,
    courseType: course.course_type,
    curriculum: course.curriculum,
    isThesis: course.is_thesis,
  }));
}

async function readCourse(id: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, code, name, school, active, cycle, credits, course_type, curriculum, is_thesis
      from courses
      where id = $1 and active = true
      limit 1
    `,
    [id],
  )) as CourseRow[];
  return rows[0];
}

function mapCourseRow(course: CourseRow): Course {
  return {
    id: course.id,
    code: course.code ?? undefined,
    name: course.name,
    school: course.school,
    active: course.active,
    cycle: course.cycle,
    credits: course.credits,
    courseType: course.course_type,
    curriculum: course.curriculum,
    isThesis: course.is_thesis,
  };
}

async function readSettings(): Promise<ScheduleSettings> {
  const sql = getSql();
  const rows = (await sql.query(
    "select key, value from app_settings where key in ('academic_term', 'period_closed', 'period_closed_at')",
  )) as { key: string; value: string }[];
  const values = new Map(rows.map((row) => [row.key, row.value]));
  const periodClosed = values.get("period_closed") === "true";
  return {
    academicTerm: values.get("academic_term") ?? defaultAcademicTerm,
    periodClosed,
    periodClosedAt: periodClosed
      ? (values.get("period_closed_at") ?? undefined)
      : undefined,
  };
}

async function readScheduleEvents(teacherId?: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select
        se.id::int,
        se.teacher_id,
        se.actor_user_id,
        coalesce(au.name, se.actor_user_id) as actor_name,
        se.event_type,
        se.metadata,
        se.created_at::text
      from schedule_events se
      left join app_users au on au.clerk_user_id = se.actor_user_id
      where $1::text is null or se.teacher_id = $1
      order by se.created_at desc
      limit 100
    `,
    [teacherId ?? null],
  )) as ScheduleEventRow[];
  return rows.map((row) => ({
    id: row.id,
    teacherId: row.teacher_id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name ?? row.actor_user_id,
    eventType: row.event_type,
    metadata:
      typeof row.metadata === "string"
        ? (JSON.parse(row.metadata) as Record<string, unknown>)
        : row.metadata,
    createdAt: row.created_at,
  }));
}

async function readUsers(): Promise<ScheduleUser[]> {
  const sql = getSql();
  const rows = (await sql.query(`
    select
      au.clerk_user_id,
      au.email,
      au.name,
      au.role,
      au.school,
      au.code,
      au.created_at::text,
      au.updated_at::text,
      tp.status as teacher_status
    from app_users au
    left join teacher_profiles tp on tp.clerk_user_id = au.clerk_user_id
    order by
      case au.role when 'direccion' then 0 else 1 end,
      au.name asc
  `)) as AppUserRow[];
  return rows.map((row) => ({
    clerkUserId: row.clerk_user_id,
    email: row.email,
    name: row.name,
    role: row.role,
    school: row.school,
    onboardingComplete: row.code.trim().length > 0,
    teacherStatus: row.teacher_status ?? null,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  }));
}

async function readSchools() {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select distinct school
      from courses
      where active = true
      order by school asc
    `,
  )) as { school: string }[];
  return rows.length ? rows.map((row) => row.school) : schools;
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

function slugifyCourseId(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return normalized || `curso-${Date.now()}`;
}

function getPreviewPayload(identity: ScheduleIdentity): SchedulePayload {
  const profile = seedTeachers[0];
  return {
    currentUserId: identity.clerkUserId,
    profile,
    teachers: seedTeachers,
    users: [
      {
        clerkUserId: "local-preview",
        email: "preview@unmsm.edu.pe",
        name: identity.name,
        role: "direccion",
        school: "Ing. de Sistemas",
        onboardingComplete: true,
        teacherStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        clerkUserId: seedTeachers[0].id,
        email: seedTeachers[0].email,
        name: seedTeachers[0].name,
        role: "docente",
        school: "Ing. de Sistemas",
        onboardingComplete: true,
        teacherStatus: seedTeachers[0].status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        clerkUserId: seedTeachers[2].id,
        email: seedTeachers[2].email,
        name: seedTeachers[2].name,
        role: "docente",
        school: "Contabilidad",
        onboardingComplete: true,
        teacherStatus: seedTeachers[2].status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    catalog: courseCatalog,
    schools,
    settings: {
      academicTerm: defaultAcademicTerm,
      periodClosed: false,
    },
    events: [
      {
        id: 1,
        teacherId: seedTeachers[0].id,
        actorUserId: "preview-director",
        actorName: "Dirección",
        eventType: "teacher.submitted_schedule",
        metadata: { submittedAt: "03 Jun 2026, 18:12" },
        createdAt: new Date().toISOString(),
      },
      {
        id: 2,
        teacherId: seedTeachers[1].id,
        actorUserId: "preview-director",
        actorName: "Dirección",
        eventType: "director.approved_schedule",
        metadata: { approvedAt: "03 Jun 2026, 18:20" },
        createdAt: new Date().toISOString(),
      },
    ],
    onboarding: {
      role: "direccion",
      school: "Ing. de Sistemas",
      code: "PREVIEW",
      complete: true,
    },
    canUseDirection: true,
    userName: identity.name,
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
        updated_at = case
          when app_users.email is distinct from excluded.email
            or app_users.name is distinct from excluded.name
          then now()
          else app_users.updated_at
        end
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
    return seedTeachers[0];
  }
  const sql = getSql();
  const officialRows = (await sql.query(
    `
      update teacher_profiles
      set clerk_user_id = $1,
          updated_at = case
            when clerk_user_id is distinct from $1 then now()
            else updated_at
          end
      where lower(email) = lower($2)
        and (clerk_user_id is null or clerk_user_id = $1)
      returning id
    `,
    [identity.clerkUserId, identity.email],
  )) as { id: string }[];
  if (officialRows[0]) {
    return readTeacher(officialRows[0].id);
  }
  await sql.query(
    `
      insert into teacher_profiles (id, clerk_user_id, name, email, contract, status)
      values ($1, $1, $2, $3, 'full', 'borrador')
      on conflict (id) do update set
        name = excluded.name,
        email = excluded.email,
        updated_at = case
          when teacher_profiles.name is distinct from excluded.name
            or teacher_profiles.email is distinct from excluded.email
          then now()
          else teacher_profiles.updated_at
        end
    `,
    [profileId, identity.name, identity.email],
  );
  return readTeacher(profileId);
}

async function getProfileId(identity: ScheduleIdentity) {
  await ensureSeeded();
  if (identity.preview) {
    return "me";
  }
  await ensureUser(identity);
  const profile = await ensureTeacherProfile(identity.clerkUserId, identity);
  return profile.id;
}

async function readTeachers() {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select tp.id, tp.teacher_code, tp.name, tp.email, tp.category, tp.academic_degree, tp.contract, tp.status, tp.review_note, tp.submitted_at, tp.approved_at, tp.updated_at::text
      from teacher_profiles tp
      left join app_users au on au.clerk_user_id = tp.clerk_user_id
      where coalesce(au.role, 'docente') = 'docente'
      order by
        case tp.status
          when 'observado' then 0
          when 'borrador' then 1
          when 'enviado' then 2
          else 3
        end,
        tp.name asc
    `,
  )) as TeacherRow[];
  return Promise.all(rows.map((row) => inflateTeacher(row)));
}

async function readTeacher(id: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, teacher_code, name, email, category, academic_degree, contract, status, review_note, submitted_at, approved_at, updated_at::text
      from teacher_profiles
      where id = $1
      limit 1
    `,
    [id],
  )) as TeacherRow[];
  if (!rows[0]) {
    throw new ScheduleError("Docente no encontrado.", 404);
  }
  return inflateTeacher(rows[0]);
}

async function inflateTeacher(row: TeacherRow): Promise<TeacherProfile> {
  const sql = getSql();
  const courseRows = (await sql.query(
    `
      select c.id, c.code, c.name, c.school, c.cycle, c.credits, c.course_type, c.curriculum, c.is_thesis
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
    teacherCode: row.teacher_code ?? undefined,
    name: row.name,
    email: row.email,
    category: row.category ?? undefined,
    academicDegree: row.academic_degree ?? undefined,
    contract: row.contract,
    status: row.status,
    reviewNote: row.review_note || undefined,
    submittedAt: row.submitted_at ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    courses: courseRows.map((course) => ({
      id: course.id,
      code: course.code ?? undefined,
      name: course.name,
      school: course.school,
      cycle: course.cycle,
      credits: course.credits,
      courseType: course.course_type,
      curriculum: course.curriculum,
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

async function recordEvent(
  identity: ScheduleIdentity,
  teacherId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
) {
  if (identity.preview) {
    return;
  }
  const sql = getSql();
  await sql.query(
    `
      insert into schedule_events (teacher_id, actor_user_id, event_type, metadata)
      values ($1, $2, $3, $4::jsonb)
    `,
    [teacherId, identity.clerkUserId, eventType, JSON.stringify(metadata)],
  );
}
