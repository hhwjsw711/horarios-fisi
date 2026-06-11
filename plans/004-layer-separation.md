# Plan 004: Separate layers: extract domain types and reorganize src/lib into domain/data/api/auth

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6fa5165..HEAD -- src/lib/ src/app/ src/components/schedule-app.tsx`
> Plans 002/003 may have landed (they touch `schedule-db.ts`, webhook, scripts);
> that is expected drift. STOP only if files were moved/renamed or types were
> already extracted.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (mechanical: type extraction + file moves + import updates; zero logic changes)
- **Depends on**: plans/003-quick-hygiene.md (the `typecheck` script is this plan's main verification gate)
- **Category**: tech-debt
- **Planned at**: commit `6fa5165`, 2026-06-11

## Why this matters

The repo is meant to be a replicable architecture template for FISI projects, with four explicit layers: front, API, domain, data. Today `src/lib/` is a flat junk drawer where the data layer (`schedule-db.ts`) is also the hub that exports the domain types (`AppRole`, `SchedulePayload`, `ScheduleIdentity`, `ScheduleEvent`, `ScheduleUser`), so UI, auth, and API all import from the data layer. After this plan: types live in a domain module, folders express the layers, and the dependency rule (front -> api -> domain <- data) is visible in the import graph. No behavior changes.

## Current state

Files in `src/lib/` and their actual layer:

| File | Layer | Notes |
|---|---|---|
| `schedule-rules.ts` (+test) | domain | pure, already clean |
| `schedule-courses.ts` (+test) | domain | pure |
| `schedule-data.ts` | domain | constants/catalog types (`ContractKey`, days, hours) |
| `teacher-course-import.ts` (+test) | domain | CSV parse/validate |
| `schedule-db.ts` | data | 2400+ lines; ALSO exports the shared types |
| `schedule-action-runner.ts` | api | dispatcher; imports types + functions from schedule-db |
| `schedule-action-types.ts` | api | action union types |
| `schedule-identity.ts` | auth | imports `AppRole`, `ScheduleIdentity` from schedule-db |
| `utils.ts` | shared | `cn()` |

Known type importers from `schedule-db` (verify with grep, there may be more):
- `src/components/schedule-app.tsx:153` imports `AppRole, ScheduleEvent, SchedulePayload, ScheduleUser`
- `src/lib/schedule-identity.ts:2` imports `AppRole, ScheduleIdentity`
- `src/lib/schedule-action-runner.ts:7` imports `AppRole, ScheduleIdentity`
- `src/app/api/schedule/route.ts:3` imports `getSchedulePayload, type ScheduleIdentity`

Also misplaced: `src/app/schedule-actions.ts` (server actions wrapper) and `src/app/schedule-route.tsx` (shared route component rendering ScheduleApp) sit at the `app/` root next to route segments.

Public route folders `/docente`, `/direccion`, `/onboarding` are Spanish ON PURPOSE (user-facing URLs for a Spanish-speaking audience; live in production). Do NOT rename them. All new folders/files in this plan are English.

Path alias: `@/*` maps to `src/*` (see `tsconfig.json`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 (gate after every move) |
| Tests | `bun run test` | all pass |
| Lint+format | `bun run lint` | exit 0 |
| Full check | `bun run check` | exit 0 |

## Scope

**In scope**:
- Create `src/lib/domain/types.ts`; move type/interface definitions there.
- Move files: `schedule-rules.ts`, `schedule-courses.ts`, `schedule-data.ts`, `teacher-course-import.ts` (+ their `.test.ts`) into `src/lib/domain/`; `schedule-db.ts` into `src/lib/data/`; `schedule-action-runner.ts`, `schedule-action-types.ts` into `src/lib/api/`; `schedule-identity.ts` into `src/lib/auth/`.
- Move `src/app/schedule-route.tsx` to `src/components/schedule-route.tsx`. Keep `src/app/schedule-actions.ts` where it is (server actions entry; moving it changes nothing and risks RSC boundary surprises).
- Update every import across `src/` and `scripts/` accordingly. Use `git mv` for moves.

**Out of scope** (do NOT touch):
- Any function body or logic in any moved file. This plan moves code and types; it does not edit behavior. The ONLY content edits allowed are import/export statements.
- Splitting `schedule-app.tsx` or `schedule-db.ts` internally.
- Route folders under `src/app/` (Spanish URLs stay).
- `src/components/ui/*`.

## Git workflow

- Branch: `advisor/004-layer-separation`
- One commit per step (`git mv` keeps history). Short imperative English messages. Never add Co-Authored-By lines.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract shared types into the domain layer

Create `src/lib/domain/types.ts`. Move (cut, not copy) from `schedule-db.ts` the exported type/interface declarations consumed outside the data layer: `AppRole`, `SchedulePayload`, `ScheduleIdentity`, `ScheduleEvent`, `ScheduleUser`, and any type they reference transitively that is not a DB row shape. First enumerate the real list: `grep -n "import.*from \"@/lib/schedule-db\"" -r src/ scripts/` and collect every `type`-only import. Internal row types (e.g. anything named `*Row`) stay in `schedule-db.ts` unexported. `schedule-db.ts` then imports the moved types from `@/lib/domain/types` and re-exports nothing type-wise (update its importers instead).

**Verify**: `bun run typecheck` exits 0; `bun run test` all pass.

### Step 2: Repoint type importers

Update `schedule-app.tsx`, `schedule-identity.ts`, `schedule-action-runner.ts`, `schedule-action-types.ts`, `src/app/api/schedule/route.ts`, and any other hit from the step 1 grep so that types come from `@/lib/domain/types` and only runtime functions come from `schedule-db`.

**Verify**: `grep -rn "type.*from \"@/lib/schedule-db\"" src/ scripts/` returns nothing; `bun run typecheck` exits 0.

### Step 3: Move files into layer folders

`git mv` per the Scope list. Update imports mechanically (find/replace of the old specifiers, e.g. `@/lib/schedule-rules` -> `@/lib/domain/schedule-rules`, `@/lib/schedule-db` -> `@/lib/data/schedule-db`, etc.). Check `scripts/*.ts` too (e.g. `scripts/migrate.ts` imports from `../src/lib/schedule-db` with a relative path).

**Verify**: `bun run typecheck` exits 0; `bun run test` all pass; `ls src/lib` shows only `domain/ data/ api/ auth/ utils.ts`.

### Step 4: Move schedule-route.tsx and run the full gate

`git mv src/app/schedule-route.tsx src/components/schedule-route.tsx`; update its importers (the route pages under `docente/`, `direccion/`, etc.).

**Verify**: `bun run check` exits 0 (build proves the RSC tree still resolves).

### Step 5: Add the dependency rule note

Create `src/lib/README.md` (10 lines max, English): the four folders, the rule "imports flow front -> api -> domain <- data; domain imports nothing from next/, data, or api", and a pointer to `docs/architecture.md` (Plan 001).

**Verify**: `bun run lint` exits 0; `git status --short` shows only in-scope paths.

## Test plan

No new tests: the three existing domain test files move with their modules and must keep passing unchanged (that is the regression signal). `bun run test` count before == after.

## Done criteria

- [ ] `src/lib/{domain,data,api,auth}/` exist and contain the files listed in Scope
- [ ] `grep -rn "type.*from \"@/lib/data/schedule-db\"" src/` returns nothing (types come from domain)
- [ ] Test count unchanged and all pass; `bun run check` exits 0
- [ ] Git history preserved for moved files (`git log --follow src/lib/data/schedule-db.ts` shows pre-move commits)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A type you try to move drags DB row types or runtime values with it in a way that needs logic edits (report the tangle instead of refactoring logic).
- `next build` fails after step 4 with an RSC/server-actions boundary error.
- You find a circular import between domain and data after the moves.

## Maintenance notes

- This unlocks the future split of `schedule-app.tsx` (views can import domain types without touching the data layer) and the migrations refactor of `schedule-db.ts`.
- Reviewer: check the diff is 95% import lines and `git mv`; any function-body hunk is out of contract.
- Follow-up deferred: enforce the dependency rule with Biome's `noRestrictedImports` once the team agrees on it.
