# Plan 002: Make multi-step mutations atomic and close the course-limit race

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6fa5165..HEAD -- src/lib/schedule-db.ts`
> If the file changed, compare the "Current state" excerpts against the live
> code before proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (touches production mutation paths; mitigated by single-statement SQL rewrites)
- **Depends on**: none (Plan 003's typecheck script helps but is not required)
- **Category**: bug
- **Planned at**: commit `6fa5165`, 2026-06-11

## Why this matters

This app is in production (horarios-unmsm.vercel.app) with ~90 real FISI teachers. Three mutation paths can leave the database inconsistent: (1) approve/submit update a teacher's status and then insert the audit event as a separate statement, so a failure between the two produces approved/submitted teachers with no audit trail; (2) `replaceCourses` deletes all of a teacher's courses and re-inserts them in a loop with no transaction, so a mid-loop failure loses courses; (3) `addCourseToTeacher` checks the course limit in memory and inserts afterwards, so two concurrent requests can both pass the check and exceed a teacher's contract limit. The audit trail is an institutional requirement (Dirección relies on it), which makes (1) the most important.

## Current state

All in `src/lib/schedule-db.ts`. The DB driver is `@neondatabase/serverless` over HTTP; `getSql()` returns the client. IMPORTANT: the Neon HTTP driver's `transaction()` is non-interactive (it accepts a list of queries, you cannot read results mid-transaction and branch). The fixes below therefore use single-statement SQL (CTEs) where branching on a result is needed, and `transaction()` only where the statements are independent of each other's results. There is one existing transaction usage in this file (inside `writeTeacherCourseImport`, around line 1287); read it before starting and match its call style exactly.

Excerpt 1 — `approveSchedule` (lines 1375-1408), status update then separate event insert:

```ts
// schedule-db.ts:1394-1406
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
```

Note `approveSchedule` also does check-then-act on status: it reads the profile (line 1384), throws unless `status === "enviado"` (line 1388), then runs the UPDATE without a status guard in the WHERE clause.

Excerpt 2 — `submitSchedule` (lines 1410-1452): same shape; the non-sandbox branch updates `teacher_profiles` to `'enviado'` (lines 1435-1442) then calls `recordEvent(identity, ..., "teacher.submitted_schedule", ...)` (lines 1443-1450). The sandbox branch (lines 1424-1433) records no event and needs no change.

Excerpt 3 — `replaceCourses` (lines 2385-2400), delete then insert loop, no transaction:

```ts
async function replaceCourses(teacherId: string, courseIds: string[]) {
  const sql = getSql();
  await sql.query("delete from teacher_courses where teacher_id = $1", [teacherId]);
  for (const [index, courseId] of courseIds.entries()) {
    await sql.query(
      `insert into teacher_courses (teacher_id, course_id, position)
       values ($1, $2, $3)
       on conflict (teacher_id, course_id) do update set position = excluded.position`,
      [teacherId, courseId, index + 1],
    );
  }
}
```

Excerpt 4 — `addCourseToTeacher` (lines 846-883), in-memory limit check then insert:

```ts
const profile = await readTeacher(teacherId);
const assignment = courseAssignmentState(profile, mapCourseRow(course));
if (assignment.limitReached) {
  throw new ScheduleError("Ya alcanzaste el máximo de cursos permitido.");
}
await sql.query(
  `insert into teacher_courses (teacher_id, course_id, position)
   values ($1, $2, coalesce((select max(position) + 1 from teacher_courses where teacher_id = $1), 1))
   on conflict (teacher_id, course_id) do nothing`,
  [teacherId, courseId],
);
```

`recordEvent` (lines 2402-2419) inserts into `schedule_events (teacher_id, actor_user_id, event_type, metadata)` and early-returns when `identity.preview` is true. Preserve the preview behavior in every rewrite.

The course limit comes from the domain: `courseAssignmentState` in `src/lib/schedule-rules.ts` (read it to find how the max is derived from the teacher's contract). Do not change the domain module.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Tests | `bun run test` | all pass |
| Lint | `bun run lint` | exit 0 |
| Full check | `bun run check` | exit 0 |

There is no test database wired into `bun test` (DB functions have no tests yet; that is Plan 005). Your safety net is: single-statement rewrites, `bun run check`, and careful diff review.

## Scope

**In scope** (the only file you should modify):
- `src/lib/schedule-db.ts`

**Out of scope** (do NOT touch):
- `src/lib/schedule-rules.ts` and any other domain module (the limit calculation stays where it is; you only need the numeric max).
- `src/components/schedule-app.tsx`, server actions, API routes.
- Schema DDL in `ensureScheduleSchema()` (no new tables, no triggers in this plan).
- Error message strings shown to users (the UI may match on them).

## Git workflow

- Branch: `advisor/002-transactional-integrity`
- One commit per step, short imperative English (match `git log`, e.g. "Make approve and submit atomic"). Never add Co-Authored-By lines.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make approveSchedule atomic and guard the status transition

Replace the UPDATE + `recordEvent` pair with one CTE statement that performs the guarded update and the event insert atomically, then branches on the result in JS only to detect the no-op case:

```ts
const result = await sql.query(
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
  [teacherId, approvedAt, identity.clerkUserId, JSON.stringify({ approvedAt })],
);
```

Keep the existing pre-checks (they produce the right user-facing errors). After the statement, if zero rows came back, the teacher was concurrently modified: throw `new ScheduleError("Solo puedes aprobar horarios enviados.")` to match the existing error. Respect `identity.preview`: the function already early-returns before any write; verify that path is untouched. Check how this codebase reads row results from `sql.query` (look at existing call sites that use returned rows) and match that access pattern.

**Verify**: `bun run check` exits 0.

### Step 2: Make submitSchedule atomic (non-sandbox branch)

Same CTE shape: guarded update of `teacher_profiles` to `'enviado'` (the existing UPDATE has no status guard; keep it unguarded on status but keep `where id = $1`) combined with the `teacher.submitted_schedule` event insert in one statement. The sandbox branch stays as is.

**Verify**: `bun run check` exits 0.

### Step 3: Wrap replaceCourses in a transaction

The delete and the inserts are independent of each other's results, so the Neon non-interactive `transaction()` works. Build the statement list (delete + one insert per course) and run it in a single `transaction()` call, matching the call style used in `writeTeacherCourseImport` (~line 1287). Keep the `on conflict` clause.

**Verify**: `bun run check` exits 0.

### Step 4: Close the addCourseToTeacher race

Keep the in-memory check (it produces the friendly error for the common case) but make the INSERT itself enforce the limit so concurrent requests cannot exceed it. Derive the teacher's max course count before the insert (from the same domain call already in scope) into a variable `maxCourses`, then:

```ts
const inserted = await sql.query(
  `
    insert into teacher_courses (teacher_id, course_id, position)
    select $1, $2, coalesce((select max(position) + 1 from teacher_courses where teacher_id = $1), 1)
    where (select count(*) from teacher_courses where teacher_id = $1) < $3
    on conflict (teacher_id, course_id) do nothing
    returning course_id
  `,
  [teacherId, courseId, maxCourses],
);
```

If zero rows return AND the course was not already assigned (`assignment.alreadyAssigned` is false), throw the existing limit error. If `courseAssignmentState` does not expose a numeric max directly, STOP and report what it does expose instead of inventing a limit calculation.

**Verify**: `bun run check` exits 0.

### Step 5: Review the diff as a whole

`git diff` must show changes only inside the four functions named above. Confirm no user-facing error string changed and `identity.preview` early-returns are intact in all four functions.

**Verify**: `git diff --stat` shows only `src/lib/schedule-db.ts`; `bun run check` exits 0.

## Test plan

DB-backed tests are out of scope here (no test database infrastructure exists; Plan 005 adds it and MUST cover these paths: concurrent addCourse at the limit, approve of a non-submitted teacher, event row created atomically with status change). For this plan, the verification gates are the SQL shapes themselves plus `bun run check`. If Plan 005 lands first, add these cases there instead and re-run.

## Done criteria

- [ ] `approveSchedule` and `submitSchedule` write status + audit event in one SQL statement (grep: `with updated as` appears in both)
- [ ] `replaceCourses` uses `transaction(` (grep confirms)
- [ ] `addCourseToTeacher` INSERT contains the `where (select count(*)` guard
- [ ] `bun run check` exits 0
- [ ] Only `src/lib/schedule-db.ts` modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts above do not match the live code (drift).
- `sql.query` result-row access pattern is unclear after reading existing call sites (do not guess the driver API).
- The Neon driver version in `package.json` does not support `transaction()` in the style used at ~line 1287.
- `courseAssignmentState` exposes no usable numeric max (step 4).
- `bun run check` fails twice on a step after a reasonable fix attempt.

## Maintenance notes

- If a future plan introduces versioned migrations and DB-level constraints (e.g. a trigger enforcing course limits), the step 4 SQL guard becomes redundant and can be simplified.
- Reviewer should scrutinize: the CTE returns (no-op detection), preview-mode early returns, and that `formatTimestamp()` semantics were not changed (timestamps as locale text are a known separate issue, deliberately NOT fixed here to keep this diff reviewable; see finding 8 in the audit, future plan candidate).
- The events table write in approve/submit no longer goes through `recordEvent()`; if `recordEvent` gains new behavior (e.g. notification fan-out), these two inline inserts must be revisited.
