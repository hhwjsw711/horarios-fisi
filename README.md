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
bun scripts/migrate.ts
```

La migración crea el esquema y carga solo el catálogo base de cursos. Los docentes demo se cargan únicamente si ejecutas `bun scripts/migrate.ts --demo`.

## Funciones

- Autenticación por correo con Clerk.
- Onboarding por rol docente o Dirección.
- Registro de disponibilidad por docente.
- Validación de reglas para tiempo completo, parcial 20 h y parcial 10 h.
- Catálogo de escuelas y cursos editable desde Dirección.
- Vista de Dirección para revisar docentes.
- Observaciones administrativas con historial de eventos.
- Exportación de disponibilidad a PDF y Excel.

## Licencia

MIT
