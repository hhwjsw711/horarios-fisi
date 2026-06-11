# Plan 005: Characterization tests for the data layer against a real Postgres

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6fa5165..HEAD -- src/lib/`
> Plans 002/004 are expected drift (transactional rewrites, file moves). Use
> the post-004 path `src/lib/data/schedule-db.ts` if it exists, else
> `src/lib/schedule-db.ts`. STOP only if the exported function names referenced
> below no longer exist.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (test infra against a real DB; zero risk to production code, but flaky tests are worse than no tests, so the isolation discipline below is mandatory)
- **Depends on**: plans/004-layer-separation.md (paths), plans/002-transactional-integrity.md (locks in the fixed behavior)
- **Category**: tests
- **Planned at**: commit `6fa5165`, 2026-06-11

## Why this matters

`schedule-db.ts` holds ~40 exported functions covering every mutation in a production system (status transitions, course assignment with contract limits, audit events, period close) and has zero tests; only the pure domain modules are covered. Every future refactor of this file (versioned migrations, the planned split of the god component, the timetable-building roadmap) is blind without characterization tests that pin current behavior. This plan adds a DB-backed test suite that runs against a disposable Postgres, skips cleanly when no test database is configured, and covers the critical paths.

## Current state

- Data layer: `src/lib/data/schedule-db.ts` (post Plan 004; originally `src/lib/schedule-db.ts`). Connection: `getSql()` reads `process.env.DATABASE_URL` and returns a `@neondatabase/serverless` client. Schema bootstrap: `ensureScheduleSchema()`; seed: `seedScheduleData({ includeDemoTeachers })`; verification: `verifyScheduleSchema()` (see `scripts/migrate.ts` for the canonical bootstrap sequence).
- Existing test conventions: `bun:test` (`describe/it/expect` imported from "bun:test"), test files colocated as `<module>.test.ts`. Exemplar: `src/lib/domain/schedule-rules.test.ts` (structure to imitate).
- Key exported functions and behaviors to characterize (names as of `6fa5165`; re-locate after moves):
  - `syncClerkUser(...)` — upserts `app_users`, links `teacher_profiles` by email. Idempotent via `on conflict`.
  - `deleteClerkUser(id)` — removes the user; second call is a silent no-op.
  - `setAvailability`, `setContract` — teacher self-service writes; reset status to `borrador`.
  - `addCourse`/`addCourseToTeacher` — enforces contract course limit (in-memory + SQL guard after Plan 002), `on conflict do nothing` for duplicates.
  - `submitSchedule` — requires rules met (`teacherMeetsRules`), sets `enviado` + audit event atomically (post Plan 002).
  - `approveSchedule` — requires status `enviado`, sets `aprobado` + audit event atomically; approving an already-approved teacher returns payload without error; approving a `borrador` throws `ScheduleError("Solo puedes aprobar horarios enviados.")`.
  - `setPeriodClosed` / `ensurePeriodOpen` — closed period makes mutations throw.
  - `getSchedulePayload(identity)` — shape differs by role (docente sees own profile; direccion/admin see scoped teachers, users, events).
- Identity objects: build plain `ScheduleIdentity` values in tests (see the type in `src/lib/domain/types.ts` post-004); `identity.preview = true` short-circuits writes, so tests must use `preview: false` identities.
- The Neon serverless driver speaks Neon's HTTP protocol. For a local plain Postgres it will NOT work out of the box. Resolution order for the test database:
  1. If env `TEST_DATABASE_URL` is set (expected: a dedicated Neon branch), use it directly.
  2. Otherwise every DB test must `it.skip` (suite green without secrets, e.g. in CI).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Tests (no DB) | `bun run test` | all pass, DB suite skipped |
| Tests (with DB) | `TEST_DATABASE_URL=<neon-branch-url> bun run test` | all pass including DB suite |
| Typecheck | `bun run typecheck` | exit 0 |
| Full check | `bun run check` | exit 0 |

The operator must provide `TEST_DATABASE_URL` (a Neon branch of the project database created for testing, NEVER the production URL). If it is not available to you, write the suite, verify the skip path, and mark the status row "DONE (skip-path verified; DB run pending operator)".

## Scope

**In scope**:
- `src/lib/data/schedule-db.test.ts` (create; adjust path to wherever schedule-db.ts lives)
- `src/lib/data/test-helpers.ts` (create; DB setup/teardown utilities)
- `README.md` (one short subsection under "Calidad" documenting `TEST_DATABASE_URL`)

**Out of scope** (do NOT touch):
- `src/lib/data/schedule-db.ts` itself or any production source. If a behavior looks wrong while writing tests, pin the CURRENT behavior in the test with a `// CHARACTERIZATION:` comment and report it; do not fix it.
- CI workflow (wiring a Neon branch secret into CI is an operator decision; note it in Maintenance).
- `scripts/*`.

## Git workflow

- Branch: `advisor/005-schedule-db-tests`
- One commit per step, short imperative English. Never add Co-Authored-By lines.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Test harness

Create `test-helpers.ts` exporting:
- `getTestSql()` — throws unless `TEST_DATABASE_URL` is set; sets `process.env.DATABASE_URL = process.env.TEST_DATABASE_URL` BEFORE the first import of schedule-db (import order matters if `getSql()` caches; read how it instantiates and document the constraint in the helper).
- `resetDb()` — truncates all app tables (`truncate ... restart identity cascade`) so each test starts clean; derive the table list from `ensureScheduleSchema()`.
- `makeIdentity(overrides)` — builds a non-preview `ScheduleIdentity` for roles docente/direccion/admin.
- A `describeDb` wrapper: `const describeDb = process.env.TEST_DATABASE_URL ? describe : describe.skip;`

**Verify**: `bun run test` exits 0 (everything skips without the env var).

### Step 2: Bootstrap + identity tests

In `schedule-db.test.ts` under `describeDb`, `beforeAll`: `ensureScheduleSchema()` then `verifyScheduleSchema()` asserting all flags true (this also characterizes idempotency: run `ensureScheduleSchema()` twice). `beforeEach`: `resetDb()` + minimal seed (insert one school, one department, a couple of courses directly via SQL helpers rather than the full FISI seed, to keep tests fast and explicit).

Tests: `syncClerkUser` creates an `app_users` row; calling it twice with the same id updates instead of duplicating; `deleteClerkUser` twice does not throw.

**Verify**: `TEST_DATABASE_URL=... bun run test` passes (or skip-path verified if no URL).

### Step 3: Teacher lifecycle characterization

Cover, with one focused `it` each:
1. Onboarding -> `setContract` + `setAvailability` leave status `borrador`.
2. `submitSchedule` with incomplete rules throws (`Aún faltan reglas por completar.`).
3. Full happy path: contract + availability + courses meeting `schedule-rules` -> `submitSchedule` sets `enviado` AND inserts a `teacher.submitted_schedule` row in `schedule_events` (assert both in the same test: this pins Plan 002's atomicity contract).
4. `approveSchedule` on `enviado` -> `aprobado` + `director.approved_schedule` event; on `borrador` -> throws; repeated on `aprobado` -> returns payload, no duplicate event.
5. Course limit: assign courses up to the contract max, next `addCourse` throws `Ya alcanzaste el máximo de cursos permitido.`; duplicate assignment of the same course does not increment the count.
6. `setPeriodClosed(true)` makes `setAvailability` (and `submitSchedule`) throw; reopening restores writes.

**Verify**: `TEST_DATABASE_URL=... bun run test` all pass.

### Step 4: Payload shape by role

`getSchedulePayload` for a docente identity excludes other teachers' profiles and the users list; for an admin identity includes users and events. Assert shape (keys present/absent), not exact contents.

**Verify**: full suite green; `bun run check` exits 0.

### Step 5: Document

Add to README under "Calidad": how to create a Neon branch for testing (one line: Neon console or `neonctl branches create`), `TEST_DATABASE_URL=... bun run test`, and the warning to never point it at production.

**Verify**: `git status --short` shows only in-scope files.

## Test plan

This plan IS the test plan. Target: the 6 lifecycle cases + 2 sync cases + 2 payload cases minimum (10 new tests). Model structure after `src/lib/domain/schedule-rules.test.ts`.

## Done criteria

- [ ] `bun run test` green WITHOUT `TEST_DATABASE_URL` (suite skips, no hangs)
- [ ] With `TEST_DATABASE_URL`: >= 10 new tests pass, covering sync, lifecycle, limits, period close, payload-by-role
- [ ] No production source modified (`git status --short`)
- [ ] README documents the test database workflow
- [ ] `plans/README.md` status row updated

## STOP conditions

- `getSql()` caches the client at module import in a way that makes `TEST_DATABASE_URL` injection impossible without touching production code (report the exact mechanism; the fix belongs in a follow-up plan, not here).
- Any test requires modifying production source to pass.
- The Neon driver rejects the provided `TEST_DATABASE_URL` (wrong protocol): report, do not swap drivers.
- A characterized behavior contradicts Plan 002's contract (e.g. event row missing after submit): report immediately; either 002 regressed or this plan's assumption is wrong.

## Maintenance notes

- Wire `TEST_DATABASE_URL` into CI as a secret with a dedicated Neon branch when the operator decides; until then the suite is local-only by design.
- Every future schedule-db change must extend this suite; treat a shrinking test count as a review red flag.
- These tests are the prerequisite gate for the deferred refactors: splitting `schedule-app.tsx` and migrating `ensureScheduleSchema()` to versioned migrations.
