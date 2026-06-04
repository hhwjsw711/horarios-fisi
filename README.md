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

`bun run check` ejecuta Biome, tests de reglas horarias y build de producción. El smoke test valida rutas protegidas y estado de autenticación del despliegue.

Para una verificación operacional contra producción:

```bash
vercel env pull /tmp/horarios-unmsm-prod.env --environment=production
bun run ops:verify -- --vercel-env-file /tmp/horarios-unmsm-prod.env --min-teachers 90 --min-linked-teachers 90 --min-active-courses 200
rm -f /tmp/horarios-unmsm-prod.env
```

El verificador revisa rutas públicas, env vars críticas, schema, conteos de Neon e invariantes de disponibilidad y cupos sin imprimir secretos.

## Funciones

- Autenticación por correo con Clerk.
- Onboarding por rol docente o Dirección.
- Registro de disponibilidad por docente.
- Validación de reglas para tiempo completo, parcial 20 h y parcial 10 h.
- Catálogo de escuelas y cursos editable desde Dirección.
- Búsqueda y filtros de catálogo por curso, escuela y estado.
- Vista de Dirección para revisar docentes.
- Búsqueda y filtros administrativos por docente, correo y estado.
- Gestión de usuarios, roles y escuelas desde Dirección.
- Búsqueda y filtros de usuarios por rol y onboarding.
- Aprobación de horarios y cierre/reapertura de periodo académico.
- Observaciones administrativas con historial de eventos.
- Auditoría institucional buscable y exportable a CSV.
- Exportación de disponibilidad a PDF y Excel.

## Licencia

MIT
