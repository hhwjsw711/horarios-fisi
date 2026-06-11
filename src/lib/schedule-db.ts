import { neon } from "@neondatabase/serverless";
import {
  type ContractKey,
  type Course,
  courseCatalog,
  type DayKey,
  days,
  departments,
  hours,
  normalizeDepartment,
  schools,
  seedTeachers,
  slotKey,
  type TeacherProfile,
} from "@/lib/schedule-data";
import {
  courseAssignmentState,
  validateTeacherRules,
} from "@/lib/schedule-rules";
import {
  buildTeacherCourseImport,
  parseTeacherCourseCsv,
  type TeacherCourseImportCourse,
  type TeacherCourseImportRecord,
  type TeacherCourseImportResult,
  type TeacherCourseImportTeacher,
} from "@/lib/teacher-course-import";

export type AppRole = "docente" | "direccion" | "admin";

export type Onboarding = {
  role: AppRole;
  school: string;
  code: string;
  complete: boolean;
};

export type ScheduleIdentity = {
  clerkUserId: string;
  email: string;
  imageUrl?: string;
  name: string;
  preview?: boolean;
  role?: AppRole;
};

export type SchedulePayload = {
  currentUserId: string;
  profile: TeacherProfile;
  teacherMode: "official" | "sandbox" | "administrative" | "preview";
  teachers: TeacherProfile[];
  users: ScheduleUser[];
  catalog: Course[];
  schools: string[];
  departments: string[];
  settings: ScheduleSettings;
  events: ScheduleEvent[];
  onboarding: Onboarding;
  canUseAdmin: boolean;
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
  imageUrl?: string;
  name: string;
  role: AppRole;
  school: string;
  onboardingComplete: boolean;
  lastSeenAt?: string;
  teacherCode?: string;
  teacherCategory?: string;
  academicDegree?: string;
  teacherStatus: TeacherProfile["status"] | null;
  updatedAt: string;
  createdAt: string;
};

export type ClerkUserSyncInput = {
  clerkUserId: string;
  email: string;
  imageUrl?: string;
  name: string;
  role?: AppRole;
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
  image_url: string | null;
  name: string;
  role: AppRole;
  school: string;
  code: string;
  last_seen_at?: string | null;
  teacher_code?: string | null;
  category?: string | null;
  academic_degree?: string | null;
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
  department: string | null;
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

export type TeacherCourseImportResponse = Omit<
  TeacherCourseImportResult,
  "resolvedAssignments"
> & {
  applied: boolean;
  replaceTeachers: boolean;
  payload: SchedulePayload;
};

type AvailabilityRow = {
  day_key: DayKey;
  hour: number;
};

type TeacherCourseRow = CourseRow & {
  teacher_id: string;
};

type TeacherAvailabilityRow = AvailabilityRow & {
  teacher_id: string;
};

type SandboxTeacherRow = {
  id: string;
  owner_user_id: string;
  name: string;
  email: string;
  contract: ContractKey;
  status: TeacherProfile["status"];
  submitted_at: string | null;
  updated_at: string | null;
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
      image_url text not null default '',
      role text not null default 'docente' check (role in ('docente', 'direccion', 'admin')),
      school text not null default 'Sin departamento',
      code text not null default '',
      last_seen_at timestamptz,
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
  await sql.query(`
    create table if not exists teacher_sandboxes (
      id text primary key,
      owner_user_id text not null unique references app_users(clerk_user_id) on delete cascade,
      name text not null,
      email text not null,
      contract text not null check (contract in ('full', 'partial20', 'partial10')),
      status text not null default 'borrador' check (status in ('enviado', 'borrador', 'observado', 'aprobado')),
      submitted_at text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  await sql.query(`
    create table if not exists teacher_sandbox_availability (
      sandbox_id text not null references teacher_sandboxes(id) on delete cascade,
      day_key text not null,
      hour int not null,
      primary key (sandbox_id, day_key, hour)
    )
  `);
  await sql.query(`
    create table if not exists teacher_sandbox_courses (
      sandbox_id text not null references teacher_sandboxes(id) on delete cascade,
      course_id text not null references courses(id) on delete restrict,
      position int not null default 0,
      primary key (sandbox_id, course_id)
    )
  `);
  await sql.query(
    "alter table teacher_profiles add column if not exists review_note text not null default ''",
  );
  await sql.query(
    "alter table app_users add column if not exists image_url text not null default ''",
  );
  await sql.query(
    "alter table app_users add column if not exists last_seen_at timestamptz",
  );
  await sql.query(
    "alter table app_users alter column school set default 'Sin departamento'",
  );
  await sql.query(
    "alter table app_users drop constraint if exists app_users_role_check",
  );
  await sql.query(
    "alter table app_users add constraint app_users_role_check check (role in ('docente', 'direccion', 'admin'))",
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
    "alter table teacher_profiles add column if not exists department text",
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
  const teacherColumns = (await sql.query(
    `
      select column_name
      from information_schema.columns
      where table_name = 'teacher_profiles'
        and column_name in ('approved_at', 'department', 'review_note', 'submitted_at')
      order by column_name
    `,
  )) as { column_name: string }[];
  const appUserColumns = (await sql.query(
    `
      select column_name
      from information_schema.columns
      where table_name = 'app_users'
        and column_name in ('image_url', 'last_seen_at')
      order by column_name
    `,
  )) as { column_name: string }[];
  const teacherConstraints = (await sql.query(
    `
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'teacher_profiles_status_check'
      limit 1
    `,
  )) as { definition: string }[];
  const appUserConstraints = (await sql.query(
    `
      select pg_get_constraintdef(oid) as definition
      from pg_constraint
      where conname = 'app_users_role_check'
      limit 1
    `,
  )) as { definition: string }[];
  const settings = (await sql.query(
    "select key from app_settings where key in ('academic_term', 'period_closed') order by key",
  )) as { key: string }[];
  const sandboxTables = (await sql.query(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('teacher_sandboxes', 'teacher_sandbox_availability', 'teacher_sandbox_courses')
    `,
  )) as { table_name: string }[];
  const teacherColumnNames = new Set(
    teacherColumns.map((row) => row.column_name),
  );
  const appUserColumnNames = new Set(
    appUserColumns.map((row) => row.column_name),
  );
  const settingKeys = new Set(settings.map((row) => row.key));
  const statusConstraint = teacherConstraints[0]?.definition ?? "";
  const roleConstraint = appUserConstraints[0]?.definition ?? "";
  const sandboxTableNames = new Set(sandboxTables.map((row) => row.table_name));
  return {
    appUsersAdminRole: roleConstraint.includes("admin"),
    appUsersImageUrlColumn: appUserColumnNames.has("image_url"),
    appUsersLastSeenAtColumn: appUserColumnNames.has("last_seen_at"),
    approvedAtColumn: teacherColumnNames.has("approved_at"),
    departmentColumn: teacherColumnNames.has("department"),
    reviewNoteColumn: teacherColumnNames.has("review_note"),
    submittedAtColumn: teacherColumnNames.has("submitted_at"),
    statusAllowsApproved: statusConstraint.includes("aprobado"),
    academicTermSetting: settingKeys.has("academic_term"),
    periodClosedSetting: settingKeys.has("period_closed"),
    teacherSandboxTables:
      sandboxTableNames.has("teacher_sandboxes") &&
      sandboxTableNames.has("teacher_sandbox_availability") &&
      sandboxTableNames.has("teacher_sandbox_courses"),
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
        insert into teacher_profiles (id, name, email, department, contract, status, review_note, submitted_at, approved_at)
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        on conflict (id) do update set
          name = excluded.name,
          email = excluded.email,
          department = excluded.department,
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
        teacher.department ?? null,
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
  const officialProfile = await linkOfficialTeacherProfile(identity);
  const canUseDirection = canUseDirectionRole(user.role);
  const canUseAdmin = user.role === "admin";
  const sandboxProfile =
    !officialProfile && canUseAdmin
      ? await ensureTeacherSandbox(identity, user)
      : null;
  const profile =
    officialProfile ??
    sandboxProfile ??
    (canUseDirection
      ? administrativeProfile(user)
      : await ensureTeacherProfile(identity.clerkUserId, identity));
  const teacherMode = officialProfile
    ? "official"
    : sandboxProfile
      ? "sandbox"
      : canUseDirection
        ? "administrative"
        : "official";
  const departmentScope = canUseAdmin
    ? undefined
    : normalizeDepartment(user.school);
  const [
    catalog,
    schoolOptions,
    departmentOptions,
    settings,
    teachers,
    users,
    events,
  ] = await Promise.all([
    readCourseCatalog(),
    readSchools(),
    readDepartments(),
    readSettings(),
    canUseDirection
      ? readTeachers(departmentScope)
      : Promise.resolve([profile]),
    canUseAdmin ? readUsers() : Promise.resolve([]),
    canUseDirection
      ? readScheduleEvents(undefined, departmentScope)
      : readScheduleEvents(profile.id),
  ]);
  return {
    currentUserId: identity.clerkUserId,
    profile,
    teacherMode,
    teachers,
    users,
    catalog,
    schools: schoolOptions,
    departments: departmentOptions,
    settings,
    events,
    onboarding: {
      role: user.role,
      school: normalizeDepartment(user.school),
      code: user.code,
      complete: user.code.trim().length > 0 || canUseDirection,
    },
    canUseAdmin,
    canUseDirection,
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
  const validated = validateOnboarding(onboarding, await readDepartments());
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
      select teacher_code, department
      from teacher_profiles
      where lower(email) = lower($1)
      limit 1
    `,
    [input.email],
  )) as { teacher_code: string | null; department: string | null }[];
  const teacherCode = officialRows[0]?.teacher_code?.trim() ?? "";
  const teacherDepartment = normalizeDepartment(officialRows[0]?.department);
  const rows = (await sql.query(
    `
      insert into app_users (clerk_user_id, email, name, image_url, role, school, code)
      values (
        $1,
        $2,
        $3,
        $4,
        coalesce($5::text, 'docente'),
        $7,
        case
          when $5::text = 'admin' then 'ADMIN'
          when $5::text = 'direccion' then 'DIRECCION'
          else $6
        end
      )
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        name = excluded.name,
        image_url = excluded.image_url,
        role = case
          when $5::text is not null then excluded.role
          else app_users.role
        end,
        school = case
          when app_users.school in ('', 'Ing. de Sistemas', 'Sin departamento') then excluded.school
          else app_users.school
        end,
        code = case
          when app_users.code = '' and excluded.code <> '' then excluded.code
          else app_users.code
        end,
        updated_at = case
          when app_users.email is distinct from excluded.email
            or app_users.name is distinct from excluded.name
            or app_users.image_url is distinct from excluded.image_url
            or ($5::text is not null and app_users.role is distinct from excluded.role)
            or (
              app_users.school in ('', 'Ing. de Sistemas', 'Sin departamento')
              and app_users.school is distinct from excluded.school
            )
            or (app_users.code = '' and excluded.code <> '')
          then now()
          else app_users.updated_at
        end
      returning clerk_user_id
    `,
    [
      input.clerkUserId,
      input.email,
      input.name,
      input.imageUrl ?? "",
      input.role ?? null,
      teacherCode,
      teacherDepartment,
    ],
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
  const workspace = await getWritableTeacherWorkspace(identity);
  if (workspace.sandbox) {
    await sql.query(
      `
        update teacher_sandboxes
        set contract = $2, status = 'borrador', submitted_at = null, updated_at = now()
        where id = $1
      `,
      [workspace.profile.id, contract],
    );
    return getSchedulePayload(identity);
  }
  await sql.query(
    `
      update teacher_profiles
      set contract = $2, status = 'borrador', review_note = '', approved_at = null, updated_at = now()
      where id = $1
    `,
    [workspace.profile.id, contract],
  );
  await recordEvent(
    identity,
    workspace.profile.id,
    "teacher.contract_changed",
    {
      contract,
    },
  );
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
  const workspace = await getWritableTeacherWorkspace(identity);
  const normalizedAvailability = normalizeAvailability(availability);
  if (workspace.sandbox) {
    await replaceSandboxAvailability(
      workspace.profile.id,
      normalizedAvailability,
    );
    const sql = getSql();
    await sql.query(
      "update teacher_sandboxes set status = 'borrador', submitted_at = null, updated_at = now() where id = $1",
      [workspace.profile.id],
    );
    return getSchedulePayload(identity);
  }
  await replaceAvailability(workspace.profile.id, normalizedAvailability);
  const sql = getSql();
  await sql.query(
    "update teacher_profiles set status = 'borrador', review_note = '', approved_at = null, updated_at = now() where id = $1",
    [workspace.profile.id],
  );
  await recordEvent(
    identity,
    workspace.profile.id,
    "teacher.availability_changed",
    {
      slots: normalizedAvailability.length,
    },
  );
  return getSchedulePayload(identity);
}

export async function addCourse(identity: ScheduleIdentity, courseId: string) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  const workspace = await getWritableTeacherWorkspace(identity);
  if (workspace.sandbox) {
    return addCourseToSandbox(identity, workspace.profile.id, courseId);
  }
  return addCourseToTeacher(
    identity,
    workspace.profile.id,
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
  await ensureTeacherReviewAccess(identity, teacherId);
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

async function addCourseToSandbox(
  identity: ScheduleIdentity,
  sandboxId: string,
  courseId: string,
) {
  await ensurePeriodOpen();
  const sql = getSql();
  const course = await readCourse(courseId);
  if (!course) {
    throw new ScheduleError("Curso no válido.");
  }
  const profile = await readTeacherSandbox(sandboxId);
  const assignment = courseAssignmentState(profile, mapCourseRow(course));
  if (assignment.limitReached) {
    throw new ScheduleError("Ya alcanzaste el máximo de cursos permitido.");
  }
  await sql.query(
    `
      insert into teacher_sandbox_courses (sandbox_id, course_id, position)
      values (
        $1,
        $2,
        coalesce((select max(position) + 1 from teacher_sandbox_courses where sandbox_id = $1), 1)
      )
      on conflict (sandbox_id, course_id) do nothing
    `,
    [sandboxId, courseId],
  );
  if (!assignment.alreadyAssigned) {
    await markSandboxDraft(sandboxId);
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
  await ensureAdmin(identity);
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
  await ensureAdmin(identity);
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
  await ensureAdmin(identity);
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
  await validateUserAccessChange(identity, targetUserId, role, school);
  const normalizedSchool = normalizeDepartment(school);
  const sql = getSql();
  await sql.query(
    `
      update app_users
      set role = $2,
          school = $3,
          code = case
            when $2 = 'admin' and code = '' then 'ADMIN'
            when $2 = 'direccion' and code = '' then 'DIRECCION'
            else code
          end,
          updated_at = now()
      where clerk_user_id = $1
    `,
    [targetUserId, role, normalizedSchool],
  );
  await recordEvent(identity, targetUserId, "access.user_updated", {
    role,
    school: normalizedSchool,
  });
  return getSchedulePayload(identity);
}

export async function validateUserAccessChange(
  identity: ScheduleIdentity,
  targetUserId: string,
  role: AppRole,
  school: string,
) {
  if (identity.preview) {
    return;
  }
  await ensureAdmin(identity);
  const normalizedSchool = normalizeDepartment(school);
  const schoolOptions = await readDepartments();
  if (!schoolOptions.includes(normalizedSchool)) {
    throw new ScheduleError("Departamento no válido.");
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
  if (targetUserId === identity.clerkUserId && role !== "admin") {
    throw new ScheduleError("No puedes retirar tu propio acceso.", 403);
  }
  if (target.role === "admin" && role !== "admin") {
    const adminRows = (await sql.query(
      "select count(*)::int as count from app_users where role = 'admin' and clerk_user_id <> $1",
      [targetUserId],
    )) as { count: number }[];
    if (Number(adminRows[0]?.count ?? 0) === 0) {
      throw new ScheduleError("Debe quedar al menos un usuario Admin.");
    }
  }
}

export async function removeCourse(
  identity: ScheduleIdentity,
  courseId: string,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  const workspace = await getWritableTeacherWorkspace(identity);
  if (workspace.sandbox) {
    return removeCourseFromSandbox(identity, workspace.profile.id, courseId);
  }
  return removeCourseFromTeacher(
    identity,
    workspace.profile.id,
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
  await ensureTeacherReviewAccess(identity, teacherId);
  return removeCourseFromTeacher(
    identity,
    teacherId,
    courseId,
    "director.course_unassigned",
  );
}

export async function importTeacherCourses(
  identity: ScheduleIdentity,
  input: {
    apply: boolean;
    csv: string;
    replaceTeachers: boolean;
  },
): Promise<TeacherCourseImportResponse> {
  if (identity.preview) {
    const payload = getPreviewPayload(identity);
    return {
      ok: true,
      applied: false,
      replaceTeachers: input.replaceTeachers,
      rows: 0,
      assignments: 0,
      teachers: 0,
      errors: [],
      warnings: ["La importación real está desactivada en vista local."],
      preview: [],
      payload,
    };
  }
  await ensureAdmin(identity);
  if (input.apply) {
    await ensurePeriodOpen();
  }
  let records: TeacherCourseImportRecord[];
  try {
    records = parseTeacherCourseCsv(input.csv);
  } catch {
    throw new ScheduleError("CSV no válido.");
  }
  const [teachers, courses, existingAssignments] = await Promise.all([
    readTeacherCourseImportTeachers(),
    readTeacherCourseImportCourses(),
    readTeacherCourseExistingAssignments(),
  ]);
  const result = buildTeacherCourseImport({
    courses,
    existingAssignments,
    records,
    replaceTeachers: input.replaceTeachers,
    teachers,
  });
  if (result.ok && input.apply) {
    await writeTeacherCourseImport(
      identity,
      result.resolvedAssignments,
      input.replaceTeachers,
    );
  }
  const publicResult = {
    ok: result.ok,
    rows: result.rows,
    assignments: result.assignments,
    teachers: result.teachers,
    errors: result.errors,
    warnings: result.warnings,
    preview: result.preview,
  };
  return {
    ...publicResult,
    applied: result.ok && input.apply,
    replaceTeachers: input.replaceTeachers,
    payload: await getSchedulePayload(identity),
  };
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

async function removeCourseFromSandbox(
  identity: ScheduleIdentity,
  sandboxId: string,
  courseId: string,
) {
  await ensurePeriodOpen();
  await readTeacherSandbox(sandboxId);
  const sql = getSql();
  const rows = (await sql.query(
    "delete from teacher_sandbox_courses where sandbox_id = $1 and course_id = $2 returning course_id",
    [sandboxId, courseId],
  )) as { course_id: string }[];
  if (rows[0]) {
    await markSandboxDraft(sandboxId);
  }
  return getSchedulePayload(identity);
}

async function readTeacherCourseImportTeachers() {
  const sql = getSql();
  return (await sql.query(
    `
      select id, teacher_code, email, name, contract
      from teacher_profiles
      order by name
    `,
  )) as TeacherCourseImportTeacher[];
}

async function readTeacherCourseImportCourses() {
  const sql = getSql();
  return (await sql.query(
    `
      select id, code, name, school, is_thesis
      from courses
      where active = true
      order by school, name
    `,
  )) as TeacherCourseImportCourse[];
}

async function readTeacherCourseExistingAssignments() {
  const sql = getSql();
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

async function writeTeacherCourseImport(
  identity: ScheduleIdentity,
  assignments: TeacherCourseImportResult["resolvedAssignments"],
  replaceTeachers: boolean,
) {
  if (!assignments.length) {
    return;
  }
  const sql = getSql();
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
    ...teacherIds.map(
      (teacherId) =>
        tx`
          update teacher_profiles
          set status = 'borrador',
              review_note = '',
              approved_at = null,
              updated_at = now()
          where id = ${teacherId}
        `,
    ),
  ]);
  for (const teacherId of teacherIds) {
    const importedCourses = assignments.filter(
      (assignment) => assignment.teacher.id === teacherId,
    ).length;
    await recordEvent(identity, teacherId, "director.course_imported", {
      importedCourses,
      replaceTeachers,
    });
  }
}

async function markTeacherDraft(teacherId: string) {
  const sql = getSql();
  await sql.query(
    "update teacher_profiles set status = 'borrador', review_note = '', approved_at = null, updated_at = now() where id = $1",
    [teacherId],
  );
}

async function markSandboxDraft(sandboxId: string) {
  const sql = getSql();
  await sql.query(
    "update teacher_sandboxes set status = 'borrador', submitted_at = null, updated_at = now() where id = $1",
    [sandboxId],
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
  await ensureTeacherReviewAccess(identity, teacherId);
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
  await ensureTeacherReviewAccess(identity, teacherId);
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
  const result = (await sql.query(
    `
      with updated as (
        update teacher_profiles
        set status = 'aprobado', review_note = '', approved_at = $2, updated_at = now()
        where id = $1 and status = 'enviado'
        returning id
      )
      insert into schedule_events (teacher_id, actor_user_id, event_type, metadata)
      select id, $3, 'director.approved_schedule', $4::jsonb from updated
      returning teacher_id
    `,
    [
      teacherId,
      approvedAt,
      identity.clerkUserId,
      JSON.stringify({ approvedAt }),
    ],
  )) as { teacher_id: string }[];
  if (result.length === 0) {
    throw new ScheduleError("Solo puedes aprobar horarios enviados.");
  }
  return getSchedulePayload(identity);
}

export async function submitSchedule(identity: ScheduleIdentity) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensurePeriodOpen();
  const sql = getSql();
  const workspace = await getWritableTeacherWorkspace(identity);
  const profile = workspace.sandbox
    ? await readTeacherSandbox(workspace.profile.id)
    : await readTeacher(workspace.profile.id);
  if (!teacherMeetsRules(profile)) {
    throw new ScheduleError("Aún faltan reglas por completar.");
  }
  const submittedAt = formatTimestamp();
  if (workspace.sandbox) {
    await sql.query(
      `
        update teacher_sandboxes
        set status = 'enviado', submitted_at = $2, updated_at = now()
        where id = $1
      `,
      [workspace.profile.id, submittedAt],
    );
    return getSchedulePayload(identity);
  }
  await sql.query(
    `
      update teacher_profiles
      set status = 'enviado', review_note = '', submitted_at = $2, approved_at = null, updated_at = now()
      where id = $1
    `,
    [workspace.profile.id, submittedAt],
  );
  await recordEvent(
    identity,
    workspace.profile.id,
    "teacher.submitted_schedule",
    {
      submittedAt,
    },
  );
  return getSchedulePayload(identity);
}

export async function setPeriodClosed(
  identity: ScheduleIdentity,
  closed: boolean,
) {
  if (identity.preview) {
    return getPreviewPayload(identity);
  }
  await ensureAdmin(identity);
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

async function ensureAdmin(identity: ScheduleIdentity) {
  await ensureSeeded();
  const user = await ensureUser(identity);
  if (user.role !== "admin") {
    throw new ScheduleError("No tienes acceso Admin.", 403);
  }
}

async function ensureTeacherReviewAccess(
  identity: ScheduleIdentity,
  teacherId: string,
) {
  await ensureSeeded();
  const user = await ensureUser(identity);
  if (user.role === "admin") {
    return user;
  }
  if (user.role !== "direccion") {
    throw new ScheduleError("No tienes acceso Dirección.", 403);
  }
  const teacher = await readTeacher(teacherId);
  if (
    !teacher.department ||
    normalizeDepartment(teacher.department) !== normalizeDepartment(user.school)
  ) {
    throw new ScheduleError("Docente fuera de tu departamento.", 403);
  }
  return user;
}

function canUseDirectionRole(role: AppRole) {
  return role === "admin" || role === "direccion";
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
  onboarding: Omit<Onboarding, "complete">,
  availableSchools: string[],
) {
  const school = normalizeDepartment(onboarding.school);
  if (!availableSchools.includes(school)) {
    throw new ScheduleError("Departamento no válido.");
  }
  if (onboarding.code.trim().length < 4) {
    throw new ScheduleError("Código institucional no válido.");
  }
  if (onboarding.role !== "docente") {
    throw new ScheduleError(
      "Los roles administrativos se asignan desde Clerk.",
      403,
    );
  }
  return {
    role: "docente" as const,
    school,
    code: onboarding.code.trim(),
  };
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

async function readScheduleEvents(
  teacherId?: string,
  departmentScope?: string,
) {
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
      where ($1::text is null or se.teacher_id = $1)
        and (
          $2::text is null
          or exists (
            select 1
            from teacher_profiles tp
            where tp.id = se.teacher_id
              and lower(coalesce(tp.department, '')) = lower($2)
          )
        )
      order by se.created_at desc
      limit 100
    `,
    [teacherId ?? null, departmentScope ?? null],
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
      au.image_url,
      au.name,
      au.role,
      coalesce(nullif(tp.department, ''), au.school) as school,
      au.code,
      au.last_seen_at::text,
      coalesce(tp.teacher_code, nullif(au.code, '')) as teacher_code,
      tp.category,
      tp.academic_degree,
      au.created_at::text,
      au.updated_at::text,
      tp.status as teacher_status
    from app_users au
    left join teacher_profiles tp on tp.clerk_user_id = au.clerk_user_id
    order by
      case au.role when 'admin' then 0 when 'direccion' then 1 else 2 end,
      au.name asc
  `)) as AppUserRow[];
  return rows.map((row) => ({
    clerkUserId: row.clerk_user_id,
    email: row.email,
    imageUrl: row.image_url || undefined,
    name: row.name,
    role: row.role,
    school: normalizeDepartment(row.school),
    onboardingComplete: Boolean(row.last_seen_at),
    lastSeenAt: row.last_seen_at ?? undefined,
    teacherCode: row.teacher_code?.trim() || undefined,
    teacherCategory: row.category?.trim() || undefined,
    academicDegree: row.academic_degree?.trim() || undefined,
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

async function readDepartments() {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select distinct department
      from teacher_profiles
      where nullif(trim(coalesce(department, '')), '') is not null
      order by department asc
    `,
  )) as { department: string }[];
  const values = rows.map((row) => normalizeDepartment(row.department));
  return Array.from(new Set([...departments, ...values]));
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
    teacherMode: "preview",
    teachers: seedTeachers,
    users: [
      {
        clerkUserId: "local-preview",
        email: "preview@unmsm.edu.pe",
        name: identity.name,
        imageUrl: "",
        role: "admin",
        school: "Ing. de Sistemas",
        onboardingComplete: true,
        lastSeenAt: new Date().toISOString(),
        teacherCode: "PREVIEW",
        teacherCategory: "Admin",
        academicDegree: "No aplica",
        teacherStatus: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        clerkUserId: seedTeachers[0].id,
        email: seedTeachers[0].email,
        imageUrl: "",
        name: seedTeachers[0].name,
        role: "docente",
        school: "Ing. de Sistemas",
        onboardingComplete: true,
        lastSeenAt: new Date().toISOString(),
        teacherCode: seedTeachers[0].teacherCode,
        teacherCategory: seedTeachers[0].category,
        academicDegree: seedTeachers[0].academicDegree,
        teacherStatus: seedTeachers[0].status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        clerkUserId: seedTeachers[2].id,
        email: seedTeachers[2].email,
        imageUrl: "",
        name: seedTeachers[2].name,
        role: "docente",
        school: "Contabilidad",
        onboardingComplete: true,
        lastSeenAt: new Date().toISOString(),
        teacherCode: seedTeachers[2].teacherCode,
        teacherCategory: seedTeachers[2].category,
        academicDegree: seedTeachers[2].academicDegree,
        teacherStatus: seedTeachers[2].status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
    catalog: courseCatalog,
    schools,
    departments,
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
      role: "admin",
      school: "Ing. de Sistemas",
      code: "PREVIEW",
      complete: true,
    },
    canUseAdmin: true,
    canUseDirection: true,
    userName: identity.name,
  };
}

async function ensureUser(identity: ScheduleIdentity) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      insert into app_users (clerk_user_id, email, name, image_url, role, code, last_seen_at)
      values (
        $1,
        $2,
        $3,
        $4,
        coalesce($5::text, 'docente'),
        case
          when $5::text = 'admin' then 'ADMIN'
          when $5::text = 'direccion' then 'DIRECCION'
          else ''
        end,
        now()
      )
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        name = excluded.name,
        image_url = excluded.image_url,
        last_seen_at = now(),
        role = case
          when $5::text is not null then excluded.role
          else app_users.role
        end,
        code = case
          when app_users.code = '' and excluded.code <> '' then excluded.code
          else app_users.code
        end,
        updated_at = case
          when app_users.email is distinct from excluded.email
            or app_users.name is distinct from excluded.name
            or app_users.image_url is distinct from excluded.image_url
            or ($5::text is not null and app_users.role is distinct from excluded.role)
            or (app_users.code = '' and excluded.code <> '')
          then now()
          else app_users.updated_at
        end
      returning clerk_user_id, email, name, image_url, role, school, code
    `,
    [
      identity.clerkUserId,
      identity.email,
      identity.name,
      identity.imageUrl ?? "",
      identity.role ?? null,
    ],
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
  const officialProfile = await linkOfficialTeacherProfile(identity);
  if (officialProfile) {
    return officialProfile;
  }
  const sql = getSql();
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

async function linkOfficialTeacherProfile(identity: ScheduleIdentity) {
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
      returning id, teacher_code, department
    `,
    [identity.clerkUserId, identity.email],
  )) as {
    id: string;
    teacher_code: string | null;
    department: string | null;
  }[];
  const officialProfile = officialRows[0];
  if (officialProfile) {
    await sql.query(
      `
        update app_users
        set school = $2,
            code = case
              when code = '' and $3 <> '' then $3
              else code
            end,
            updated_at = case
              when school is distinct from $2
                or (code = '' and $3 <> '')
              then now()
              else updated_at
            end
        where clerk_user_id = $1
      `,
      [
        identity.clerkUserId,
        normalizeDepartment(officialProfile.department),
        officialProfile.teacher_code?.trim() ?? "",
      ],
    );
    return readTeacher(officialProfile.id);
  }
  return null;
}

function administrativeProfile(user: AppUserRow): TeacherProfile {
  return {
    id: user.clerk_user_id,
    name: user.name,
    email: user.email,
    department: normalizeDepartment(user.school),
    contract: "full",
    status: "borrador",
    courses: [],
    availability: [],
  };
}

async function getWritableTeacherWorkspace(identity: ScheduleIdentity) {
  await ensureSeeded();
  const user = await ensureUser(identity);
  const officialProfile = await linkOfficialTeacherProfile(identity);
  if (officialProfile) {
    return { profile: officialProfile, sandbox: false };
  }
  if (user.role === "admin") {
    return {
      profile: await ensureTeacherSandbox(identity, user),
      sandbox: true,
    };
  }
  if (canUseDirectionRole(user.role)) {
    throw new ScheduleError("Tu cuenta no tiene perfil docente asignado.", 403);
  }
  const profile = await ensureTeacherProfile(identity.clerkUserId, identity);
  return { profile, sandbox: false };
}

async function ensureTeacherSandbox(
  identity: ScheduleIdentity,
  user: AppUserRow,
) {
  const sql = getSql();
  const id = sandboxTeacherId(identity.clerkUserId);
  await sql.query(
    `
      insert into teacher_sandboxes (id, owner_user_id, name, email, contract, status)
      values ($1, $2, $3, $4, 'full', 'borrador')
      on conflict (owner_user_id) do update set
        name = excluded.name,
        email = excluded.email,
        updated_at = case
          when teacher_sandboxes.name is distinct from excluded.name
            or teacher_sandboxes.email is distinct from excluded.email
          then now()
          else teacher_sandboxes.updated_at
        end
    `,
    [id, identity.clerkUserId, user.name, user.email],
  );
  return readTeacherSandbox(id);
}

function sandboxTeacherId(clerkUserId: string) {
  return `sandbox:${clerkUserId}`;
}

async function readTeachers(departmentScope?: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select tp.id, tp.teacher_code, tp.name, tp.email, tp.category, tp.academic_degree, tp.department, tp.contract, tp.status, tp.review_note, tp.submitted_at, tp.approved_at, tp.updated_at::text
      from teacher_profiles tp
      where $1::text is null
        or lower(coalesce(tp.department, '')) = lower($1)
      order by
        case tp.status
          when 'observado' then 0
          when 'borrador' then 1
          when 'enviado' then 2
          else 3
        end,
        tp.name asc
    `,
    [departmentScope ?? null],
  )) as TeacherRow[];
  if (!rows.length) {
    return [];
  }
  const teacherIds = rows.map((row) => row.id);
  const courseRowsPromise = sql.query(
    `
      select tc.teacher_id, c.id, c.code, c.name, c.school, c.cycle, c.credits, c.course_type, c.curriculum, c.is_thesis
      from teacher_courses tc
      join courses c on c.id = tc.course_id
      where tc.teacher_id = any($1::text[])
      order by tc.teacher_id asc, tc.position asc, c.name asc
    `,
    [teacherIds],
  ) as unknown as Promise<TeacherCourseRow[]>;
  const availabilityRowsPromise = sql.query(
    `
      select teacher_id, day_key, hour
      from teacher_availability
      where teacher_id = any($1::text[])
      order by teacher_id asc, day_key asc, hour asc
    `,
    [teacherIds],
  ) as unknown as Promise<TeacherAvailabilityRow[]>;
  const [courseRows, availabilityRows] = await Promise.all([
    courseRowsPromise,
    availabilityRowsPromise,
  ]);
  const coursesByTeacher = new Map<string, CourseRow[]>();
  for (const course of courseRows) {
    const current = coursesByTeacher.get(course.teacher_id) ?? [];
    current.push(course);
    coursesByTeacher.set(course.teacher_id, current);
  }
  const availabilityByTeacher = new Map<string, AvailabilityRow[]>();
  for (const availability of availabilityRows) {
    const current = availabilityByTeacher.get(availability.teacher_id) ?? [];
    current.push(availability);
    availabilityByTeacher.set(availability.teacher_id, current);
  }
  return rows.map((row) =>
    mapTeacherProfile(
      row,
      coursesByTeacher.get(row.id) ?? [],
      availabilityByTeacher.get(row.id) ?? [],
    ),
  );
}

async function readTeacher(id: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, teacher_code, name, email, category, academic_degree, department, contract, status, review_note, submitted_at, approved_at, updated_at::text
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

async function readTeacherSandbox(id: string) {
  const sql = getSql();
  const rows = (await sql.query(
    `
      select id, owner_user_id, name, email, contract, status, submitted_at, updated_at::text
      from teacher_sandboxes
      where id = $1
      limit 1
    `,
    [id],
  )) as SandboxTeacherRow[];
  if (!rows[0]) {
    throw new ScheduleError("Sandbox docente no encontrado.", 404);
  }
  return inflateTeacherSandbox(rows[0]);
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
  return mapTeacherProfile(row, courseRows, availabilityRows);
}

function mapTeacherProfile(
  row: TeacherRow,
  courseRows: CourseRow[],
  availabilityRows: AvailabilityRow[],
): TeacherProfile {
  return {
    id: row.id,
    teacherCode: row.teacher_code ?? undefined,
    name: row.name,
    email: row.email,
    category: row.category ?? undefined,
    academicDegree: row.academic_degree ?? undefined,
    department: row.department
      ? normalizeDepartment(row.department)
      : undefined,
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

async function inflateTeacherSandbox(
  row: SandboxTeacherRow,
): Promise<TeacherProfile> {
  const sql = getSql();
  const courseRows = (await sql.query(
    `
      select c.id, c.code, c.name, c.school, c.cycle, c.credits, c.course_type, c.curriculum, c.is_thesis
      from teacher_sandbox_courses sc
      join courses c on c.id = sc.course_id
      where sc.sandbox_id = $1
      order by sc.position asc, c.name asc
    `,
    [row.id],
  )) as CourseRow[];
  const availabilityRows = (await sql.query(
    `
      select day_key, hour
      from teacher_sandbox_availability
      where sandbox_id = $1
      order by day_key asc, hour asc
    `,
    [row.id],
  )) as AvailabilityRow[];
  return {
    id: row.id,
    teacherCode: "QA",
    name: row.name,
    email: row.email,
    category: "Modo prueba",
    academicDegree: "Admin",
    department: "Sandbox Admin",
    contract: row.contract,
    status: row.status,
    submittedAt: row.submitted_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
    courses: courseRows.map((course) => mapCourseRow(course)),
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

async function replaceSandboxAvailability(
  sandboxId: string,
  availability: string[],
) {
  const sql = getSql();
  await sql.query(
    "delete from teacher_sandbox_availability where sandbox_id = $1",
    [sandboxId],
  );
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
      params.push(sandboxId, item.day, item.hour);
      const start = index * 3;
      return `($${start + 1}, $${start + 2}, $${start + 3})`;
    })
    .join(", ");
  await sql.query(
    `
      insert into teacher_sandbox_availability (sandbox_id, day_key, hour)
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
