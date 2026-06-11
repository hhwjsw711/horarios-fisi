// Database characterization tests for src/lib/data/schedule-db.ts
//
// IMPORT ORDER NOTE: setupTestDb() sets process.env.DATABASE_URL from
// TEST_DATABASE_URL before any schedule-db function runs. Because getSql()
// reads process.env.DATABASE_URL on every call (no module-level caching),
// setting the env var in a beforeAll that runs before any actual query is
// sufficient. The static import of schedule-db below is safe because the
// module does not call getSql() at load time.

import { afterAll, beforeAll, beforeEach, expect, it } from "bun:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { neon } from "@neondatabase/serverless";
import {
  addCourse,
  approveSchedule,
  deleteClerkUser,
  ensureScheduleSchema,
  getSchedulePayload,
  setAvailability,
  setContract,
  submitSchedule,
  syncClerkUser,
  verifyScheduleSchema,
} from "@/lib/data/schedule-db";
import {
  describeDb,
  makeIdentity,
  resetDb,
  setupTestDb,
} from "@/lib/data/test-helpers";
import { contractRules, seedSlots } from "@/lib/domain/schedule-data";
import type { AppRole } from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Shared test SQL client — initialized in beforeAll after setupTestDb() sets
// DATABASE_URL so neon() receives the correct URL.
// ---------------------------------------------------------------------------

let sql: NeonQueryFunction<false, false>;

// ---------------------------------------------------------------------------
// Helper: insert a minimal teacher_profiles row directly (no Clerk identity
// required). Returns the inserted teacher id.
// ---------------------------------------------------------------------------
async function insertTeacher(
  id: string,
  overrides: {
    contract?: "full" | "partial20" | "partial10";
    status?: "borrador" | "enviado" | "aprobado" | "observado";
    department?: string;
    email?: string;
  } = {},
) {
  const contract = overrides.contract ?? "partial10";
  const status = overrides.status ?? "borrador";
  const department = overrides.department ?? "Ing. de Sistemas";
  const email = overrides.email ?? `${id}@unmsm.edu.pe`;
  await sql.query(
    `insert into teacher_profiles (id, name, email, contract, status, review_note, department)
     values ($1, $2, $3, $4, $5, '', $6)
     on conflict (id) do nothing`,
    [id, id, email, contract, status, department],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Helper: insert a minimal course row directly (bypasses ensureSeeded course
// catalog seeding). Returns the inserted course id.
// ---------------------------------------------------------------------------
async function insertCourse(
  id: string,
  name: string,
  school = "Ing. de Sistemas",
  isThesis = false,
) {
  await sql.query(
    `insert into courses (id, name, school, active, is_thesis)
     values ($1, $2, $3, true, $4)
     on conflict (id) do nothing`,
    [id, name, school, isThesis],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Helper: insert a minimal app_users row. Needed when functions call
// ensureUser() internally (e.g. setContract, setAvailability, submitSchedule).
// ---------------------------------------------------------------------------
async function insertUser(
  clerkUserId: string,
  email: string,
  role: AppRole = "docente",
) {
  await sql.query(
    `insert into app_users (clerk_user_id, email, name, image_url, role, school, code, last_seen_at)
     values ($1, $2, $3, '', $4, 'Ing. de Sistemas', '', now())
     on conflict (clerk_user_id) do nothing`,
    [clerkUserId, email, clerkUserId, role],
  );
}

// ---------------------------------------------------------------------------
// Helper: build a complete set of availability slots that satisfies partial10
// rules (3 days × 4 consecutive hours = 12 hours, 3 block-days).
// ---------------------------------------------------------------------------
function partial10Slots() {
  return seedSlots({
    lunes: [8, 9, 10, 11],
    miercoles: [8, 9, 10, 11],
    viernes: [14, 15, 16, 17],
  });
}

// ---------------------------------------------------------------------------
// Helper: build availability for a full-time teacher (5 days × 8 hours in two
// 4-hour blocks = 40 hours, satisfies full contract rules). Unused in the
// current characterization suite but kept for future full-contract tests.
// ---------------------------------------------------------------------------
function _fullTimeSlots() {
  return seedSlots({
    lunes: [8, 9, 10, 11, 14, 15, 16, 17],
    martes: [8, 9, 10, 11, 14, 15, 16, 17],
    miercoles: [8, 9, 10, 11, 14, 15, 16, 17],
    jueves: [8, 9, 10, 11, 14, 15, 16, 17],
    viernes: [8, 9, 10, 11, 14, 15, 16, 17],
  });
}

// ===========================================================================
// Suite
// ===========================================================================

describeDb("schedule-db (DB-backed characterization)", () => {
  beforeAll(async () => {
    setupTestDb();
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error("DATABASE_URL not set after setupTestDb");
    sql = neon(dbUrl);
    // Idempotency check: run ensureScheduleSchema twice — must not throw on
    // second call (CHARACTERIZATION: create-if-not-exists is idempotent).
    await ensureScheduleSchema();
    await ensureScheduleSchema();
  });

  afterAll(async () => {
    // Leave the schema in place; just ensure no test data bleeds out.
    await resetDb(sql);
  });

  beforeEach(async () => {
    await resetDb(sql);
    // Re-seed app_settings that ensureScheduleSchema seeds (truncate wipes them).
    await sql.query(
      `insert into app_settings (key, value) values ('academic_term', '2026.2'), ('period_closed', 'false')
       on conflict (key) do nothing`,
    );
  });

  // -------------------------------------------------------------------------
  // Step 2: verifyScheduleSchema + syncClerkUser + deleteClerkUser
  // -------------------------------------------------------------------------

  it("verifyScheduleSchema returns all flags true after ensureScheduleSchema", async () => {
    const result = await verifyScheduleSchema();
    const flags = Object.entries(result);
    for (const [flag, value] of flags) {
      expect({ flag, value }).toMatchObject({ flag, value: true });
    }
  });

  it("syncClerkUser creates an app_users row", async () => {
    await syncClerkUser({
      clerkUserId: "clerk-abc",
      email: "docente1@unmsm.edu.pe",
      name: "Docente Uno",
    });
    const rows = (await sql.query(
      "select clerk_user_id, email from app_users where clerk_user_id = $1",
      ["clerk-abc"],
    )) as { clerk_user_id: string; email: string }[];
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe("docente1@unmsm.edu.pe");
  });

  it("syncClerkUser called twice does not duplicate the row", async () => {
    await syncClerkUser({
      clerkUserId: "clerk-abc",
      email: "docente1@unmsm.edu.pe",
      name: "Docente Uno",
    });
    await syncClerkUser({
      clerkUserId: "clerk-abc",
      email: "docente1@unmsm.edu.pe",
      name: "Docente Uno Updated",
    });
    const rows = (await sql.query(
      "select count(*)::int as count from app_users where clerk_user_id = $1",
      ["clerk-abc"],
    )) as { count: number }[];
    expect(Number(rows[0].count)).toBe(1);
  });

  it("deleteClerkUser called twice does not throw", async () => {
    await syncClerkUser({
      clerkUserId: "clerk-abc",
      email: "docente1@unmsm.edu.pe",
      name: "Docente Uno",
    });
    await deleteClerkUser("clerk-abc");
    await deleteClerkUser("clerk-abc"); // should be silent no-op
    const rows = (await sql.query(
      "select count(*)::int as count from app_users where clerk_user_id = $1",
      ["clerk-abc"],
    )) as { count: number }[];
    expect(Number(rows[0].count)).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Step 3: Teacher lifecycle
  // -------------------------------------------------------------------------

  it("setContract resets status to borrador", async () => {
    const teacherId = "t-contract-test";
    await insertUser("u-contract-test", `${teacherId}@unmsm.edu.pe`, "docente");
    await insertTeacher(teacherId, {
      email: `${teacherId}@unmsm.edu.pe`,
      status: "enviado",
    });
    // Link teacher to user via email so getWritableTeacherWorkspace finds the
    // official profile.
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-contract-test", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-contract-test",
      email: `${teacherId}@unmsm.edu.pe`,
    });
    await setContract(identity, "partial20");
    const rows = (await sql.query(
      "select status from teacher_profiles where id = $1",
      [teacherId],
    )) as { status: string }[];
    expect(rows[0].status).toBe("borrador");
  });

  it("setAvailability resets status to borrador", async () => {
    const teacherId = "t-avail-test";
    await insertUser("u-avail-test", `${teacherId}@unmsm.edu.pe`, "docente");
    await insertTeacher(teacherId, {
      email: `${teacherId}@unmsm.edu.pe`,
      status: "enviado",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-avail-test", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-avail-test",
      email: `${teacherId}@unmsm.edu.pe`,
    });
    await setAvailability(identity, partial10Slots());
    const rows = (await sql.query(
      "select status from teacher_profiles where id = $1",
      [teacherId],
    )) as { status: string }[];
    expect(rows[0].status).toBe("borrador");
  });

  it("submitSchedule throws when rules are not met", async () => {
    const teacherId = "t-submit-fail";
    await insertUser("u-submit-fail", `${teacherId}@unmsm.edu.pe`, "docente");
    await insertTeacher(teacherId, { email: `${teacherId}@unmsm.edu.pe` });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-submit-fail", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-submit-fail",
      email: `${teacherId}@unmsm.edu.pe`,
    });
    await expect(submitSchedule(identity)).rejects.toThrow(
      "Aún faltan reglas por completar.",
    );
  });

  it("happy path: contract + availability + course -> submitSchedule sets enviado and creates teacher.submitted_schedule event", async () => {
    // CONTRACT(002): this assertion pins the event-row presence after submit,
    // which holds both pre- and post-002 (the event is written in submitSchedule
    // for the non-sandbox path regardless of atomicity changes in 002).
    const teacherId = "t-happy-path";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    await insertUser("u-happy-path", userEmail, "docente");
    await insertCourse("c-happy-alg", "Algoritmos", "Ing. de Sistemas");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-happy-path", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-happy-path",
      email: userEmail,
    });
    await setAvailability(identity, partial10Slots());
    await addCourse(identity, "c-happy-alg");
    await submitSchedule(identity);
    const statusRows = (await sql.query(
      "select status from teacher_profiles where id = $1",
      [teacherId],
    )) as { status: string }[];
    expect(statusRows[0].status).toBe("enviado");
    const eventRows = (await sql.query(
      "select event_type from schedule_events where teacher_id = $1 and event_type = $2",
      [teacherId, "teacher.submitted_schedule"],
    )) as { event_type: string }[];
    expect(eventRows.length).toBeGreaterThanOrEqual(1);
  });

  it("approveSchedule on enviado sets aprobado and creates director.approved_schedule event", async () => {
    // CONTRACT(002): event row presence after approve holds pre- and post-002.
    const teacherId = "t-approve";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    const directorId = "u-director-approve";
    await insertUser("u-approve-docente", userEmail, "docente");
    await insertUser(directorId, "director-approve@unmsm.edu.pe", "admin");
    await insertCourse("c-approve-alg", "Algoritmos", "Ing. de Sistemas");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1, department = $3 where id = $2",
      ["u-approve-docente", teacherId, "Ing. de Sistemas"],
    );
    const teacherIdentity = makeIdentity({
      clerkUserId: "u-approve-docente",
      email: userEmail,
    });
    await setAvailability(teacherIdentity, partial10Slots());
    await addCourse(teacherIdentity, "c-approve-alg");
    await submitSchedule(teacherIdentity);
    const directorIdentity = makeIdentity({
      clerkUserId: directorId,
      email: "director-approve@unmsm.edu.pe",
      role: "admin",
    });
    await approveSchedule(directorIdentity, teacherId);
    const statusRows = (await sql.query(
      "select status from teacher_profiles where id = $1",
      [teacherId],
    )) as { status: string }[];
    expect(statusRows[0].status).toBe("aprobado");
    const eventRows = (await sql.query(
      "select event_type from schedule_events where teacher_id = $1 and event_type = $2",
      [teacherId, "director.approved_schedule"],
    )) as { event_type: string }[];
    expect(eventRows.length).toBe(1);
  });

  it("approveSchedule on borrador throws 'Solo puedes aprobar horarios enviados.'", async () => {
    const teacherId = "t-approve-borrador";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    const directorId = "u-director-borrador";
    await insertUser("u-borrador-docente", userEmail, "docente");
    await insertUser(directorId, "director-borrador@unmsm.edu.pe", "admin");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
      department: "Ing. de Sistemas",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-borrador-docente", teacherId],
    );
    const directorIdentity = makeIdentity({
      clerkUserId: directorId,
      email: "director-borrador@unmsm.edu.pe",
      role: "admin",
    });
    await expect(approveSchedule(directorIdentity, teacherId)).rejects.toThrow(
      "Solo puedes aprobar horarios enviados.",
    );
  });

  it("approveSchedule repeated on aprobado does not create a duplicate event", async () => {
    const teacherId = "t-approve-repeat";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    const directorId = "u-director-repeat";
    await insertUser("u-repeat-docente", userEmail, "docente");
    await insertUser(directorId, "director-repeat@unmsm.edu.pe", "admin");
    await insertCourse("c-repeat-alg", "Algoritmos", "Ing. de Sistemas");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
      department: "Ing. de Sistemas",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1, department = $3 where id = $2",
      ["u-repeat-docente", teacherId, "Ing. de Sistemas"],
    );
    const teacherIdentity = makeIdentity({
      clerkUserId: "u-repeat-docente",
      email: userEmail,
    });
    await setAvailability(teacherIdentity, partial10Slots());
    await addCourse(teacherIdentity, "c-repeat-alg");
    await submitSchedule(teacherIdentity);
    const directorIdentity = makeIdentity({
      clerkUserId: directorId,
      email: "director-repeat@unmsm.edu.pe",
      role: "admin",
    });
    await approveSchedule(directorIdentity, teacherId);
    await approveSchedule(directorIdentity, teacherId); // second call — should return without new event
    const eventRows = (await sql.query(
      "select event_type from schedule_events where teacher_id = $1 and event_type = $2",
      [teacherId, "director.approved_schedule"],
    )) as { event_type: string }[];
    // CHARACTERIZATION: approveSchedule returns early (no new event) when status
    // is already 'aprobado'. The event count must stay at 1.
    expect(eventRows.length).toBe(1);
  });

  it("addCourse up to contract max is accepted, next call throws course limit error", async () => {
    const teacherId = "t-limit";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    const maxCourses = contractRules.partial10.maxCourses; // 1 non-thesis course
    await insertUser("u-limit", userEmail, "docente");
    await insertCourse("c-limit-a", "Curso A", "Ing. de Sistemas");
    await insertCourse("c-limit-b", "Curso B", "Ing. de Sistemas");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-limit", teacherId],
    );
    const identity = makeIdentity({ clerkUserId: "u-limit", email: userEmail });
    // Fill up to maxCourses
    await addCourse(identity, "c-limit-a");
    // One beyond the limit must throw
    await expect(addCourse(identity, "c-limit-b")).rejects.toThrow(
      "Ya alcanzaste el máximo de cursos permitido.",
    );
    const rows = (await sql.query(
      "select count(*)::int as count from teacher_courses where teacher_id = $1",
      [teacherId],
    )) as { count: number }[];
    expect(Number(rows[0].count)).toBe(maxCourses);
  });

  it("addCourse duplicate same-course assignment does not increment count", async () => {
    const teacherId = "t-dup-course";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    await insertUser("u-dup-course", userEmail, "docente");
    await insertCourse("c-dup", "Algoritmos", "Ing. de Sistemas");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "full",
      status: "borrador",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-dup-course", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-dup-course",
      email: userEmail,
    });
    await addCourse(identity, "c-dup");
    await addCourse(identity, "c-dup"); // duplicate — should be silently ignored
    const rows = (await sql.query(
      "select count(*)::int as count from teacher_courses where teacher_id = $1 and course_id = $2",
      [teacherId, "c-dup"],
    )) as { count: number }[];
    expect(Number(rows[0].count)).toBe(1);
  });

  it("setPeriodClosed blocks setAvailability and submitSchedule; reopening restores writes", async () => {
    // NOTE: setPeriodClosed(true) requires all existing teachers to be approved
    // and at least one teacher to exist. We use a direct SQL upsert to force
    // period_closed = 'true' without going through the business logic guard.
    const teacherId = "t-period-gate";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    await insertUser("u-period-gate", userEmail, "docente");
    await insertTeacher(teacherId, {
      email: userEmail,
      contract: "partial10",
      status: "borrador",
    });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-period-gate", teacherId],
    );
    // Force period closed directly (bypass the business-rule check in
    // setPeriodClosed that requires all teachers to be approved first).
    await sql.query(
      "update app_settings set value = 'true' where key = 'period_closed'",
    );
    const identity = makeIdentity({
      clerkUserId: "u-period-gate",
      email: userEmail,
    });
    await expect(setAvailability(identity, partial10Slots())).rejects.toThrow(
      "El periodo académico está cerrado.",
    );
    await expect(submitSchedule(identity)).rejects.toThrow(
      "El periodo académico está cerrado.",
    );
    // Reopen period
    await sql.query(
      "update app_settings set value = 'false' where key = 'period_closed'",
    );
    // setAvailability should now succeed without throwing
    await expect(
      setAvailability(identity, partial10Slots()),
    ).resolves.toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Step 4: Payload shape by role
  // -------------------------------------------------------------------------

  it("getSchedulePayload for docente identity: users list is empty, own profile present", async () => {
    const teacherId = "t-payload-docente";
    const userEmail = `${teacherId}@unmsm.edu.pe`;
    await insertUser("u-payload-docente", userEmail, "docente");
    await insertTeacher(teacherId, { email: userEmail, contract: "partial10" });
    await sql.query(
      "update teacher_profiles set clerk_user_id = $1 where id = $2",
      ["u-payload-docente", teacherId],
    );
    const identity = makeIdentity({
      clerkUserId: "u-payload-docente",
      email: userEmail,
      role: "docente",
    });
    const payload = await getSchedulePayload(identity);
    // docente: users array should be empty (only admin sees users)
    expect(Array.isArray(payload.users)).toBe(true);
    expect(payload.users.length).toBe(0);
    // docente: own profile present
    expect(payload.profile).toBeDefined();
    expect("id" in payload.profile).toBe(true);
    expect("courses" in payload.profile).toBe(true);
    expect("availability" in payload.profile).toBe(true);
    expect(payload.canUseAdmin).toBe(false);
  });

  it("getSchedulePayload for admin identity: users and events fields present", async () => {
    const adminId = "u-payload-admin";
    await insertUser(adminId, "admin-payload@unmsm.edu.pe", "admin");
    const identity = makeIdentity({
      clerkUserId: adminId,
      email: "admin-payload@unmsm.edu.pe",
      role: "admin",
    });
    const payload = await getSchedulePayload(identity);
    // admin: users array present (may be empty if no teachers, but the key exists)
    expect(Array.isArray(payload.users)).toBe(true);
    // admin: events array present
    expect(Array.isArray(payload.events)).toBe(true);
    expect(payload.canUseAdmin).toBe(true);
    expect(payload.canUseDirection).toBe(true);
  });
});
