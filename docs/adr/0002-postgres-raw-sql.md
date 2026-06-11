# ADR 0002: Postgres con SQL parametrizado directo

## Contexto

La aplicación necesita persistencia relacional. Las opciones evaluadas fueron un ORM (Drizzle, Prisma) y SQL directo sobre `@neondatabase/serverless`.

## Decisión

Se usa Neon Postgres con `@neondatabase/serverless` y SQL parametrizado directamente en `src/lib/schedule-db.ts`. No hay ORM.

## Consecuencias

- El SQL es visible y auditado: cada consulta puede leerse sin traducir una DSL de ORM. Esto es relevante en un contexto académico donde la transparencia del código tiene valor didáctico.
- El esquema vive en `ensureScheduleSchema()` como sentencias `CREATE TABLE IF NOT EXISTS`. Es ejecutable en cada arranque de la aplicación, lo que simplifica el despliegue inicial.
- Compensación conocida: las migraciones de esquema se gestionan con sentencias `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` dentro de la misma función. No existe un sistema formal de migraciones versionadas. Esta es una mejora pendiente sin fecha comprometida.
- El acceso a datos está encapsulado en `schedule-db.ts`; si en el futuro se decide adoptar un ORM, el cambio queda contenido en ese módulo.
