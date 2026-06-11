# Arquitectura

## Vision

Horarios UNMSM es un sistema de registro de disponibilidad docente para la Facultad de Ingenieria de Sistemas e Informatica (FISI) de la UNMSM. Permite a cada docente declarar sus franjas horarias y los cursos que puede dictar, valida automaticamente las reglas por tipo de contrato y habilita a la Direccion para revisar, observar y aprobar cada perfil antes del cierre del periodo academico.

## Principios

- **Extensibilidad sobre escalabilidad**: la carga esperada es la comunidad FISI, no decenas de miles de usuarios concurrentes. Las decisiones de diseno priorizan facilidad de modificacion y legibilidad del codigo.
- **Separacion logica de capas en un solo repositorio**: la interfaz de usuario, la logica de dominio y el acceso a datos viven en el mismo repositorio pero en modulos claramente delimitados. El limite entre capas se mantiene por convencion, no por infraestructura distribuida.
- **Dominio testeable sin framework**: `src/lib/schedule-rules.ts` y `src/lib/schedule-data.ts` no dependen de Next.js, Clerk ni Neon. Sus funciones son puras y tienen cobertura de tests que corren sin levantar el servidor.

## Capas

```mermaid
flowchart TB
    subgraph Front["Presentacion"]
        A["src/app (rutas Next.js)"]
        B["src/components/schedule-app.tsx\n(componente cliente unico)"]
    end

    subgraph API["API / Mutaciones"]
        C["src/app/schedule-actions.ts\n(Server Actions)"]
        D["PATCH /api/schedule\n(ruta REST para webhooks externos)"]
        E["src/lib/schedule-action-runner.ts\n(dispatcher de mutaciones)"]
    end

    subgraph Domain["Dominio"]
        F["schedule-rules.ts\n(validacion de reglas por contrato)"]
        G["schedule-data.ts\n(constantes y tipos)"]
        H["schedule-identity.ts\n(resolucion de rol desde Clerk)"]
    end

    subgraph Data["Datos"]
        I["schedule-db.ts\n(SQL parametrizado + ensureScheduleSchema)"]
        J[("Neon Postgres")]
    end

    subgraph Auth["Autenticacion"]
        K["Clerk"]
        L["src/proxy.ts\n(middleware Next.js 16)"]
        M["POST /api/webhooks/clerk\n(sincroniza app_users)"]
    end

    A --> B
    B --> C
    B --> D
    C --> E
    D --> E
    E --> F
    E --> H
    E --> I
    I --> J
    K --> L
    K --> M
    M --> I
    L --> A
```

## Flujo de autenticacion y roles

Clerk actua como proveedor de identidad. El rol efectivo de cada usuario vive en `public_metadata.role` dentro de Clerk y se refleja en la columna `role` de `app_users`.

Los tres roles y sus permisos:

| Rol | Puede hacer |
|---|---|
| `docente` | Registrar su propia disponibilidad y cursos, enviar su perfil para revision |
| `direccion` | Ver todos los perfiles docentes, aprobarlos, observarlos y cerrar/reabrir el periodo |
| `admin` | Todo lo de `direccion` mas gestion de usuarios, escuelas, catalogo de cursos y auditoria |

El webhook `POST /api/webhooks/clerk` (verificado con svix) recibe los eventos `user.created` y `user.updated`. Por cada evento, sincroniza el usuario en `app_users` leyendo `public_metadata.role`. Si el campo no existe o tiene un valor invalido, el rol queda como `docente` por defecto.

Para promover usuarios a `admin` desde la linea de comandos:

```bash
bun run clerk:set-admins -- --admin-email correo@unmsm.edu.pe
```

El script `scripts/set-admin-users.ts` actualiza el `public_metadata.role` en Clerk. El webhook propaga el cambio a `app_users` en el siguiente evento de Clerk, o bien el administrador puede forzar una sincronizacion manual.

## Decisiones de diseno

Resumidas aqui; detalle en cada ADR:

- **Next.js full-stack** (`docs/adr/0001-nextjs-fullstack.md`): un repositorio, ciclo de retroalimentacion corto, Server Components; se descarto un backend Spring Boot separado porque la necesidad era extensibilidad, no escala horizontal.
- **Postgres con SQL directo** (`docs/adr/0002-postgres-raw-sql.md`): Neon Postgres con `@neondatabase/serverless` y SQL parametrizado; sin ORM para mantener el SQL transparente y didactico.
- **Roles en Clerk** (`docs/adr/0003-clerk-roles.md`): Clerk como proveedor de identidad, roles en `public_metadata.role` reflejados en `app_users` via webhook.

## Operacion

```bash
bun run check
```

Ejecuta Biome (lint y formato), los tests de reglas horarias y el build de produccion. Requiere variables de entorno; en CI se usan valores de marcador de posicion:

```bash
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_ci
export CLERK_SECRET_KEY=sk_test_ci
export DIRECTION_ACCESS_CODE=ci-direction-code
export DIRECTION_EMAIL_ALLOWLIST=direccion@unmsm.edu.pe
bun run check
```

```bash
bun run smoke https://horarios-unmsm.vercel.app
```

Valida rutas protegidas y estado de autenticacion del despliegue.

```bash
bun run ops:verify
```

Verificacion operacional contra produccion: revisa rutas publicas, variables de entorno criticas, esquema, conteos de Neon e invariantes de disponibilidad y cupos. Ver README para el comando completo con sus parametros.

El endpoint `/api/health` devuelve un JSON con el estado del sistema y no requiere autenticacion.

## Convencion de rutas

Las rutas publicas de la aplicacion estan en espanol (`/docente`, `/direccion`, `/onboarding`) porque el publico es la comunidad FISI, hispanohablante. Todos los identificadores de codigo, nombres de archivos y carpetas estan en ingles. Esta es una decision deliberada, no una inconsistencia: el idioma de la URL refleja al usuario final; el idioma del codigo refleja al desarrollador.

## Uso como template

Este repositorio esta disenado para ser replicable en futuros proyectos de facultad. Lo que se mantiene al clonar:

- La estructura de capas (presentacion / API / dominio / datos).
- La configuracion de Biome, Bun y Tailwind CSS 4.
- El cableado de autenticacion con Clerk (middleware, webhook, roles en metadata).
- El pipeline de CI (`bun run check`).

Lo que se reemplaza segun el dominio del nuevo proyecto:

- Los modulos de dominio (`schedule-rules.ts`, `schedule-data.ts`).
- El esquema de base de datos (`ensureScheduleSchema` en `schedule-db.ts`).
- Las semillas de datos (`scripts/seed-courses.ts`).
- Los componentes de interfaz (`src/components/schedule-app.tsx`).
