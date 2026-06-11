# ADR 0003: Clerk as identity provider with roles in metadata

## Context

The system requires authentication, session management, and role-based access control. The alternatives considered were implementing custom JWT-based authentication or using an external service.

## Decision

Clerk is used as the sole identity provider. Roles (`docente`, `direccion`, `admin`) are stored in `public_metadata.role` for each user in Clerk and replicated in the `role` column of `app_users` via webhook (`POST /api/webhooks/clerk`, verified with svix).

## Consequences

- Authentication, session management, and the registration flow are delegated to Clerk, reducing the security surface the team must maintain.
- The middleware `src/proxy.ts` protects all routes that require it with a single call to `auth.protect()`.
- Known trade-off: changing a user's role requires editing `public_metadata.role` in the Clerk dashboard or running `bun run clerk:set-admins`. The change propagates to `app_users` when Clerk emits the `user.updated` event. There is no in-app role management screen that operates directly against Clerk.
- If Clerk became unavailable, session management would need to be migrated. The domain logic and database schema have no Clerk dependencies and could be reused with another provider.
