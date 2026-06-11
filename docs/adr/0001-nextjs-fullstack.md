# ADR 0001: Next.js como framework full-stack

## Contexto

El sistema necesita autenticacion, rutas protegidas, logica de validacion y acceso a base de datos. La alternativa considerada fue un backend independiente (Spring Boot) con un frontend React separado.

## Decision

Se usa Next.js 16 como unico framework. Las Server Actions (`src/app/schedule-actions.ts`) y la ruta REST (`/api/schedule`) cubren todas las mutaciones. Los Server Components reducen la carga en el cliente. Todo vive en un repositorio.

## Consecuencias

- Ciclo de retroalimentacion corto: un cambio en la capa de datos y en la interfaz se despliega en un solo comando.
- Menor superficie de operacion: no hay que mantener dos servicios, dos pipelines de CI ni dos conjuntos de variables de entorno.
- La necesidad era extensibilidad para la comunidad FISI, no escala horizontal. Next.js en Vercel cubre esa carga sin sobredisenio.
- Si el proyecto crece hasta requerir un backend dedicado, la capa de dominio (`schedule-rules.ts`, `schedule-data.ts`) puede extraerse sin cambios porque no depende de Next.js.
