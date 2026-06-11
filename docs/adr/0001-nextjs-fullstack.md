# ADR 0001: Next.js as the full-stack framework

## Context

The system requires authentication, protected routes, validation logic, and database access. The alternative considered was an independent backend (Spring Boot) with a separate React frontend.

## Decision

Next.js 16 is used as the sole framework. Server Actions (`src/app/schedule-actions.ts`) and the REST route (`/api/schedule`) cover all mutations. Server Components reduce the client-side load. Everything lives in one repository.

## Consequences

- Short feedback loop: a change to the data layer and the UI is deployed in a single command.
- Smaller operational surface: no two services, two CI pipelines, or two sets of environment variables to maintain.
- The need was extensibility for the FISI community, not horizontal scale. Next.js on Vercel covers that load without over-engineering.
- If the project grows to require a dedicated backend, the domain layer (`schedule-rules.ts`, `schedule-data.ts`) can be extracted without changes because it has no dependency on Next.js.
