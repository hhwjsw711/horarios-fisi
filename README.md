# Horarios UNMSM

App open source para registrar disponibilidad docente, validar reglas por clase docente y permitir revisión administrativa con exportación PDF/XLSX.

## Stack

- Next.js 16
- React 19
- Clerk
- shadcn/ui
- Tailwind CSS 4
- Bun
- Biome

## Desarrollo

```bash
bun install
bun dev
```

Requiere variables de Clerk en `.env.local`. El proyecto fue inicializado con `clerk init`.

## Funciones

- Autenticación por correo con Clerk.
- Registro de disponibilidad por docente.
- Validación de reglas para tiempo completo, parcial 20 h y parcial 10 h.
- Selección de escuela profesional y cursos.
- Vista de Dirección para revisar docentes.
- Exportación de disponibilidad a PDF y Excel.

## Licencia

MIT
