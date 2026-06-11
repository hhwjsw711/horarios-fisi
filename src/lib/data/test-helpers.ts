import { describe } from "bun:test";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { AppRole, ScheduleIdentity } from "@/lib/domain/types";

// getSql() in schedule-db.ts calls neon(process.env.DATABASE_URL) on every
// invocation — it is NOT cached at module level. Setting
// process.env.DATABASE_URL = process.env.TEST_DATABASE_URL in setupTestDb()
// before the first call that needs the DB is therefore sufficient and safe.
//
// The module-level `seedReady` promise in schedule-db.ts caches
// prepareScheduleData(). Tests that bypass ensureSeeded() (by calling
// ensureScheduleSchema() directly) are unaffected. Tests that go through
// normal public API functions (e.g. syncClerkUser) will trigger ensureSeeded(),
// which is fine because the schema was already set up by beforeAll.

// describeDb wraps describe.skip when no TEST_DATABASE_URL is available so the
// suite stays green and fast in CI without database credentials.
export const describeDb = process.env.TEST_DATABASE_URL
  ? describe
  : describe.skip;

// setupTestDb must be called in a beforeAll BEFORE any import that triggers
// getSql(). Because schedule-db.ts reads process.env.DATABASE_URL on every
// getSql() call (not at module load time), setting the env var here is
// sufficient — no dynamic import tricks are needed.
export function setupTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    throw new Error(
      "setupTestDb called without TEST_DATABASE_URL — guard with describeDb.",
    );
  }
  process.env.DATABASE_URL = url;
}

// resetDb truncates all 10 application tables and resets sequences.
// Order matters: child tables before parents to satisfy FK constraints.
export async function resetDb(sql: NeonQueryFunction<false, false>) {
  await sql.query(`
    truncate
      teacher_sandbox_courses,
      teacher_sandbox_availability,
      teacher_sandboxes,
      teacher_availability,
      teacher_courses,
      schedule_events,
      teacher_profiles,
      app_users,
      courses,
      app_settings
    restart identity cascade
  `);
}

// makeIdentity builds a non-preview ScheduleIdentity for use in tests.
// preview is explicitly false so writes go through to the database.
export function makeIdentity(
  overrides: Partial<ScheduleIdentity> & { role?: AppRole } = {},
): ScheduleIdentity {
  return {
    clerkUserId: "test-user-001",
    email: "test@unmsm.edu.pe",
    name: "Test User",
    preview: false,
    ...overrides,
  };
}
