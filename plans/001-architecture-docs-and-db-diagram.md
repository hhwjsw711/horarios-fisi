# Plan 001: Document the architecture and data model with diagrams

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6fa5165..HEAD -- src/lib/schedule-db.ts README.md docs/`
> If `src/lib/schedule-db.ts` changed since this plan was written, re-derive
> the table list from the live code (step 1 does this anyway).

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: commit `6fa5165`, 2026-06-11

## Why this matters

The owner presents this system to UNMSM (FISI faculty) the week of June 15, 2026. There is no `docs/` directory: the architecture, data model, and the rationale behind stack decisions (raw SQL over ORM, Next.js full-stack over a dedicated backend) exist only in the maintainers' heads. The repo is also meant to become a replicable architecture template for future faculty projects, which is impossible without written architecture docs. This plan produces the documentation and diagrams; it changes no application code.

## Current state

- `src/lib/schedule-db.ts` (2419 lines) — the entire data layer. `ensureScheduleSchema()` (around lines 221-381) contains every `create table if not exists` statement: this is the source of truth for the data model.
- `src/lib/schedule-rules.ts` — pure domain logic: validates teaching-hour rules per contract type (full time, partial 20h, partial 10h). Has tests.
- `src/lib/schedule-identity.ts` — resolves the caller's identity and role from Clerk (`public_metadata.role`: `docente`, `direccion`, `admin`).
- `src/lib/schedule-action-runner.ts` — dispatcher for all mutations, called from server actions (`src/app/schedule-actions.ts`) and from `PATCH /api/schedule`.
- `src/components/schedule-app.tsx` (5333 lines) — single client component rendering all views (onboarding, docente, direccion, configuracion, usuarios, auditoria).
- `src/proxy.ts` — Next.js middleware (Next 16 naming): Clerk auth for everything except `/`, `/sign-in`, `/sign-up`, `/demo`, `/api/health`, `/api/webhooks`; `/api/schedule` authenticates inside the handler.
- `src/app/api/webhooks/clerk/route.ts` — Clerk webhook (svix-verified via `verifyWebhook`) that syncs users into `app_users` and links teacher profiles.
- `README.md` — operational only (setup, scripts, roles, features list). Spanish.
- Docs language convention: **prose in Spanish** (audience: FISI faculty), **file and folder names in English**. No em dashes in any text. No emojis.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `bun install` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Full check | `bun run check` | exit 0 (lint + test + build) |

## Scope

**In scope** (create only; the only existing file you may modify is README.md):
- `docs/architecture.md` (create)
- `docs/data-model.md` (create)
- `docs/adr/0001-nextjs-fullstack.md`, `docs/adr/0002-postgres-raw-sql.md`, `docs/adr/0003-clerk-roles.md` (create)
- `README.md` (add a "Documentación" section linking the docs; touch nothing else)

**Out of scope** (do NOT touch):
- Any file under `src/` or `scripts/` — this plan is documentation only.
- `plans/` files other than updating your status row in `plans/README.md`.

## Git workflow

- Branch: `advisor/001-architecture-docs`
- Commit style: short imperative English, matching `git log` (e.g. "Add architecture and data model docs"). Never add Co-Authored-By lines.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Extract the real data model from the schema code

Read `src/lib/schedule-db.ts` and locate `ensureScheduleSchema()`. List every table it creates (expected tables include `app_users`, `teacher_profiles`, `teacher_availability`, `teacher_courses`, `courses`, `schools`, `departments`, `schedule_events`, `schedule_settings`, plus sandbox tables like `teacher_sandboxes`, `teacher_sandbox_availability`; trust the code, not this list). For each table record: columns, types, primary key, unique constraints, foreign keys (explicit or implied by `*_id` columns).

**Verify**: your table list count equals `grep -c "create table if not exists" src/lib/schedule-db.ts` output.

### Step 2: Write docs/data-model.md

Structure:
1. A mermaid `erDiagram` block covering every table from step 1 with relationships and cardinality.
2. A data dictionary: one subsection per table, markdown table of columns (name, type, constraints, meaning in Spanish).
3. A section "Invariantes" documenting: status flow of `teacher_profiles` (`borrador` -> `enviado` -> `aprobado`, with `review_note` for observations), the contract rules (full time, partial 20h, partial 10h reference `src/lib/schedule-rules.ts`), and the academic period open/closed gate (`ensurePeriodOpen`).

**Verify**: `grep -c "erDiagram" docs/data-model.md` returns 1, and the number of table subsections matches step 1's count.

### Step 3: Write docs/architecture.md

Sections (Spanish prose):
1. **Visión**: registro de disponibilidad docente FISI con revisión administrativa. One paragraph.
2. **Principios**: extensibilidad sobre escalabilidad (expected load is the FISI community, not tens of thousands of concurrent users); separación lógica de capas en un solo repo; dominio testeable sin framework.
3. **Capas**: a mermaid `flowchart TB` with: Front (`src/app` routes + `src/components`), API (server actions `src/app/schedule-actions.ts` + `PATCH /api/schedule`, both delegating to `src/lib/schedule-action-runner.ts`), Dominio (`schedule-rules.ts`, `schedule-courses.ts`, `schedule-data.ts`), Datos (`schedule-db.ts` -> Neon Postgres). Plus Clerk on the side feeding identity via `src/proxy.ts` and the webhook.
4. **Flujo de autenticación y roles**: Clerk `public_metadata.role` -> `app_users`, the three roles and what each can do, the webhook sync path, and `scripts/set-admin-users.ts` for promotion.
5. **Decisiones**: one-line summaries linking to the three ADRs.
6. **Operación**: `bun run check`, `bun run smoke <url>`, `bun run ops:verify` (summarize from README), `/api/health`.
7. **Convención de rutas**: public URLs stay in Spanish (`/docente`, `/direccion`) because they are user-facing for a Spanish-speaking audience; all code identifiers, file and folder names are English. State this explicitly: it is a deliberate decision, not an inconsistency.
8. **Uso como template**: what to keep (layering, tooling, auth wiring, CI) and what to replace (domain modules, schema, seed) when cloning for a new faculty project.

**Verify**: `grep -c "flowchart" docs/architecture.md` returns 1; `bun run lint` exits 0.

### Step 4: Write the three ADRs

Format per file: Contexto / Decisión / Consecuencias, max 25 lines, Spanish.
- `0001-nextjs-fullstack.md`: one repo, short dev feedback loop, Server Components; rejected dedicated Spring Boot backend because the need was extensibility, not horizontal scale.
- `0002-postgres-raw-sql.md`: Neon Postgres with raw parameterized SQL via `@neondatabase/serverless`; no ORM keeps SQL transparent and didactic; trade-off: schema lives in code (`ensureScheduleSchema`), versioned migrations are a known pending improvement (do not promise a date).
- `0003-clerk-roles.md`: Clerk as identity provider, roles in `public_metadata.role` mirrored to `app_users`, webhook as sync path; trade-off: role changes require Clerk metadata edit or the set-admins script.

**Verify**: `ls docs/adr | wc -l` returns 3.

### Step 5: Link from README

Add a `## Documentación` section to `README.md` after the `## Stack` section, linking the three docs with one-line descriptions.

**Verify**: `bun run check` exits 0. `git status --short` shows only the in-scope files.

## Test plan

No code changes; no new tests. The verification gates are the grep/ls checks above plus `bun run check`.

## Done criteria

- [ ] `docs/architecture.md`, `docs/data-model.md`, and 3 ADR files exist
- [ ] ER diagram covers every table created in `ensureScheduleSchema()` (count matches)
- [ ] `README.md` links the docs
- [ ] `bun run check` exits 0
- [ ] No files outside the in-scope list modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `ensureScheduleSchema()` no longer exists or schema creation moved elsewhere (plans drifted: a migrations refactor landed first). Report and re-derive from the new location only if it is obvious; otherwise stop.
- Any documentation claim you cannot verify in code. Do not document aspirations as facts; mark unknowns as "pendiente de verificar" or omit.

## Maintenance notes

- If Plan 004 (layer separation) lands after this, file paths in `architecture.md` need a one-pass update; the diagrams' logical shape stays valid.
- If a future migrations system replaces `ensureScheduleSchema()`, `data-model.md` becomes derived from migration files instead; note that in the doc header when it happens.
- Reviewer should check the ER diagram against `ensureScheduleSchema()` table by table; everything else is prose.
