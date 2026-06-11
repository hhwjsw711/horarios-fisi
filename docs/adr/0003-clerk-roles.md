# ADR 0003: Clerk como proveedor de identidad con roles en metadata

## Contexto

El sistema requiere autenticacion, gestion de sesiones y control de acceso por rol. Las alternativas consideradas fueron implementar autenticacion propia con JWT o usar un servicio externo.

## Decision

Se usa Clerk como unico proveedor de identidad. Los roles (`docente`, `direccion`, `admin`) se almacenan en `public_metadata.role` de cada usuario en Clerk y se replican en la columna `role` de `app_users` via webhook (`POST /api/webhooks/clerk`, verificado con svix).

## Consecuencias

- La autenticacion, el manejo de sesiones y el flujo de registro estan delegados a Clerk, reduciendo la superficie de seguridad que el equipo debe mantener.
- El middleware `src/proxy.ts` protege todas las rutas que lo requieren con una sola llamada a `auth.protect()`.
- Compensacion conocida: cambiar el rol de un usuario requiere editar `public_metadata.role` en el panel de Clerk o ejecutar `bun run clerk:set-admins`. El cambio se propaga a `app_users` cuando Clerk emite el evento `user.updated`. No hay una pantalla de administracion de roles dentro de la aplicacion que opere directamente sobre Clerk.
- Si Clerk dejara de estar disponible, seria necesario migrar la gestion de sesiones. La logica de dominio y el esquema de base de datos no tienen dependencias de Clerk y podrian reutilizarse con otro proveedor.
