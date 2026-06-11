# ADR 0002: Postgres with raw parameterized SQL

## Context

The application requires relational persistence. The options evaluated were an ORM (Drizzle, Prisma) and raw SQL over `@neondatabase/serverless`.

## Decision

Neon Postgres is used with `@neondatabase/serverless` and parameterized SQL directly in `src/lib/schedule-db.ts`. There is no ORM.

## Consequences

- SQL is visible and auditable: every query can be read without translating an ORM DSL. This is relevant in an academic context where code transparency has didactic value.
- The schema lives in `ensureScheduleSchema()` as `CREATE TABLE IF NOT EXISTS` statements. It is executable on each application start, which simplifies the initial deployment.
- Known trade-off: schema migrations are managed with `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements inside the same function. There is no formal versioned migration system. This is a pending improvement with no committed timeline.
- Data access is encapsulated in `schedule-db.ts`; if an ORM is adopted in the future, the change is contained within that module.
