# Horarios UNMSM

Open-source app for recording teacher availability, validating rules by contract type, and enabling administrative review with PDF/XLSX export.

## Stack

- Next.js 16
- React 19
- Clerk
- Neon Postgres
- shadcn/ui
- Tailwind CSS 4
- Bun
- Biome

## Documentation

- [docs/architecture.md](docs/architecture.md) - Overview, layers, authentication flow, naming conventions, and use as a template.
- [docs/data-model.md](docs/data-model.md) - Entity-relationship diagram, table dictionary, and domain invariants.
- [docs/adr/0001-nextjs-fullstack.md](docs/adr/0001-nextjs-fullstack.md) - Why Next.js full-stack instead of a separate backend.
- [docs/adr/0002-postgres-raw-sql.md](docs/adr/0002-postgres-raw-sql.md) - Why raw parameterized SQL instead of an ORM.
- [docs/adr/0003-clerk-roles.md](docs/adr/0003-clerk-roles.md) - Why Clerk as identity provider with roles in metadata.

## Development

```bash
bun install
bun dev
```

Configure `.env.local` from `.env.example`. To prepare Neon:

```bash
bun run db:migrate
```

The migration creates the schema, verifies critical columns and constraints, and seeds only the base course catalog. Demo teachers are seeded only if you run `bun run db:migrate --demo`.

## Quality

```bash
bun run check
bun run smoke https://horarios-unmsm.vercel.app
```

### Database tests

The characterization tests in `src/lib/data/schedule-db.test.ts` require a dedicated Neon database. Never use the production URL.

To create a Neon branch exclusively for tests: `neonctl branches create --name tests --parent main --project-id <your-project>`.

Then run the full suite with:

```bash
TEST_DATABASE_URL=postgres://... bun run test
```

Without `TEST_DATABASE_URL`, the 18 DB tests are skipped automatically (`describe.skip`) and the rest of the suite stays green.

`bun run check` runs Biome, schedule-rule tests, and a production build. The smoke test validates protected routes and authentication state of the deployment.

For an operational verification against production:

```bash
vercel env pull /tmp/horarios-unmsm-prod.env --environment=production
neonctl connection-string <branch> --project-id <project> --role-name <app-role> --database-name neondb --pooled --ssl require --no-color > /tmp/horarios-unmsm-db.url
bun run ops:verify -- --vercel-env-file /tmp/horarios-unmsm-prod.env --database-url-file /tmp/horarios-unmsm-db.url --min-teachers 90 --min-linked-teachers 90 --min-active-courses 200
rm -f /tmp/horarios-unmsm-prod.env /tmp/horarios-unmsm-db.url
```

The verifier checks public routes, critical env vars, schema, Neon counts, and availability and slot invariants without printing secrets. `DATABASE_URL` is passed via a temporary file because in Vercel it must be marked as sensitive and `env pull` may return only a placeholder.

## Teacher Import

Study plans and the FISI registry do not include a teacher-course matrix. When the Direction office delivers that matrix, it is loaded with a validated CSV:

```csv
teacher_code,teacher_email,course_code,school,position
012345,docente@unmsm.edu.pe,202W0701,Ing. de Sistemas,1
```

Accepted columns for teacher: `teacher_id`, `teacher_code`, `teacher_email`. Accepted columns for course: `course_id`, `course_code`, `school`. If a course code exists in more than one school, the CSV must include `school` or `course_id`.

```bash
bun run db:import:teacher-courses carga-docente.csv
bun run db:import:teacher-courses carga-docente.csv --apply --replace-teachers
```

Without `--apply`, the importer only validates. With `--replace-teachers`, it replaces the load for the teachers included in the file and respects per-contract slot limits.

## Roles

Effective roles come from `public_metadata.role` in Clerk and are mirrored in `app_users`:

- `docente`: registers their own availability and courses only.
- `direccion`: reserved for schedule review.
- `admin`: can access Direction, Users, Audit, and Settings.

To promote admins and reset the rest to `docente`:

```bash
bun run clerk:set-admins -- --admin-email raillyhugo@gmail.com --admin-email hpaucar@unmsm.edu.pe
```

## Features

- Email authentication with Clerk.
- Teacher onboarding. Administrative roles from Clerk metadata.
- Per-teacher availability registration.
- Rule validation for full-time, 20-hour part-time, and 10-hour part-time contracts.
- School and course catalog editable from Admin.
- Catalog search and filters by course, school, and status.
- Direction view for reviewing teachers.
- Administrative search and filters by teacher, email, and status.
- User, role, and school management from Admin.
- User filters by role and onboarding status.
- Schedule approval and academic period open/close.
- Administrative observations with event history.
- Searchable institutional audit log exportable to CSV.
- Availability export to PDF and Excel.

## License

MIT
