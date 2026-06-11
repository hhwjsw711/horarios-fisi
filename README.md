# Horarios UNMSM

App open source para registrar disponibilidad docente, validar reglas por clase docente y permitir revisión administrativa con exportación PDF/XLSX.

## Stack

- Next.js 16
- React 19
- Clerk
- Neon Postgres
- shadcn/ui
- Tailwind CSS 4
- Bun
- Biome

## Documentación

- [docs/architecture.md](docs/architecture.md) - Visión general, capas, flujo de autenticación, convención de rutas y uso como plantilla.
- [docs/data-model.md](docs/data-model.md) - Diagrama entidad-relación, diccionario de tablas e invariantes de dominio.
- [docs/adr/0001-nextjs-fullstack.md](docs/adr/0001-nextjs-fullstack.md) - Por qué Next.js full-stack en lugar de un backend separado.
- [docs/adr/0002-postgres-raw-sql.md](docs/adr/0002-postgres-raw-sql.md) - Por qué SQL parametrizado directo en lugar de un ORM.
- [docs/adr/0003-clerk-roles.md](docs/adr/0003-clerk-roles.md) - Por qué Clerk como proveedor de identidad con roles en metadata.

## Desarrollo

```bash
bun install
bun dev
```

Configura `.env.local` desde `.env.example`. Para preparar Neon:

```bash
bun run db:migrate
```

La migración crea el esquema, verifica columnas y constraints críticos, y carga solo el catálogo base de cursos. Los docentes demo se cargan únicamente si ejecutas `bun run db:migrate --demo`.

## Calidad

```bash
bun run check
bun run smoke https://horarios-unmsm.vercel.app
```

### Tests de base de datos

Las pruebas de caracterización en `src/lib/data/schedule-db.test.ts` requieren una base de datos Neon dedicada. Nunca uses la URL de producción.

Para crear un branch de Neon exclusivo para tests: `neonctl branches create --name tests --parent main --project-id <tu-proyecto>`.

Luego ejecuta la suite completa con:

```bash
TEST_DATABASE_URL=postgres://... bun run test
```

Sin `TEST_DATABASE_URL`, los 18 tests de BD se omiten automáticamente (`describe.skip`) y el resto de la suite sigue verde.

`bun run check` ejecuta Biome, tests de reglas horarias y build de producción. El smoke test valida rutas protegidas y estado de autenticación del despliegue.

Para una verificación operacional contra producción:

```bash
vercel env pull /tmp/horarios-unmsm-prod.env --environment=production
neonctl connection-string <branch> --project-id <project> --role-name <app-role> --database-name neondb --pooled --ssl require --no-color > /tmp/horarios-unmsm-db.url
bun run ops:verify -- --vercel-env-file /tmp/horarios-unmsm-prod.env --database-url-file /tmp/horarios-unmsm-db.url --min-teachers 90 --min-linked-teachers 90 --min-active-courses 200
rm -f /tmp/horarios-unmsm-prod.env /tmp/horarios-unmsm-db.url
```

El verificador revisa rutas públicas, env vars críticas, schema, conteos de Neon e invariantes de disponibilidad y cupos sin imprimir secretos. `DATABASE_URL` se pasa por archivo temporal porque en Vercel debe estar marcada como sensitive y `env pull` puede traer solo un placeholder.

## Carga Docente

Los planes de estudio y padrón FISI no incluyen una matriz docente-curso. Cuando Dirección entregue esa matriz, se carga con CSV validado:

```csv
teacher_code,teacher_email,course_code,school,position
012345,docente@unmsm.edu.pe,202W0701,Ing. de Sistemas,1
```

Columnas aceptadas para docente: `teacher_id`, `teacher_code`, `teacher_email`. Columnas aceptadas para curso: `course_id`, `course_code`, `school`. Si un código de curso existe en más de una escuela, el CSV debe incluir `school` o `course_id`.

```bash
bun run db:import:teacher-courses carga-docente.csv
bun run db:import:teacher-courses carga-docente.csv --apply --replace-teachers
```

Sin `--apply`, el importador solo valida. Con `--replace-teachers`, reemplaza la carga de los docentes incluidos en el archivo y respeta cupos por clase docente.

## Roles

Los roles efectivos vienen de `public_metadata.role` en Clerk y se reflejan en `app_users`:

- `docente`: solo registra su disponibilidad y cursos.
- `direccion`: reservado para revisión de horarios.
- `admin`: ve Dirección, Usuarios, Auditoría y Configuración.

Para promover admins y resetear el resto a docente:

```bash
bun run clerk:set-admins -- --admin-email raillyhugo@gmail.com --admin-email hpaucar@unmsm.edu.pe
```

## Funciones

- Autenticación por correo con Clerk.
- Onboarding docente. Roles administrativos desde Clerk metadata.
- Registro de disponibilidad por docente.
- Validación de reglas para tiempo completo, parcial 20 h y parcial 10 h.
- Catálogo de escuelas y cursos editable desde Admin.
- Búsqueda y filtros de catálogo por curso, escuela y estado.
- Vista de Dirección para revisar docentes.
- Búsqueda y filtros administrativos por docente, correo y estado.
- Gestión de usuarios, roles y escuelas desde Admin.
- Búsqueda y filtros de usuarios por rol y onboarding.
- Aprobación de horarios y cierre/reapertura de período académico.
- Observaciones administrativas con historial de eventos.
- Auditoría institucional buscable y exportable a CSV.
- Exportación de disponibilidad a PDF y Excel.

## Licencia

MIT
