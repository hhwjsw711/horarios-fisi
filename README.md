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

## Funciones

- Autenticación por correo con Clerk.
- Onboarding por rol docente o Dirección.
- Registro de disponibilidad por docente.
- Validación de reglas para tiempo completo, parcial 20 h y parcial 10 h.
- Catálogo de escuelas y cursos editable desde Dirección.
- Vista de Dirección para revisar docentes.
- Gestión de usuarios, roles y escuelas desde Dirección.
- Aprobación de horarios y cierre/reapertura de periodo académico.
- Observaciones administrativas con historial de eventos.
- Auditoría institucional buscable y exportable a CSV.
- Exportación de disponibilidad a PDF y Excel.

## Licencia

MIT
