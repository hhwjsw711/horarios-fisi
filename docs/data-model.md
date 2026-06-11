# Modelo de datos

Fuente de verdad: `src/lib/schedule-db.ts`, funcion `ensureScheduleSchema()`.

## Diagrama entidad-relacion

```mermaid
erDiagram
    app_users {
        text clerk_user_id PK
        text email
        text name
        text image_url
        text role
        text school
        text code
        timestamptz last_seen_at
        timestamptz created_at
        timestamptz updated_at
    }

    teacher_profiles {
        text id PK
        text clerk_user_id FK
        text name
        text email
        text contract
        text status
        text review_note
        text submitted_at
        text approved_at
        text teacher_code
        text category
        text academic_degree
        text department
        timestamptz created_at
        timestamptz updated_at
    }

    courses {
        text id PK
        text name
        text school
        boolean active
        boolean is_thesis
        text code
        int cycle
        int credits
        text course_type
        text curriculum
    }

    teacher_availability {
        text teacher_id FK
        text day_key
        int hour
    }

    teacher_courses {
        text teacher_id FK
        text course_id FK
        int position
    }

    app_settings {
        text key PK
        text value
        timestamptz updated_at
    }

    schedule_events {
        bigint id PK
        text teacher_id
        text actor_user_id
        text event_type
        jsonb metadata
        timestamptz created_at
    }

    teacher_sandboxes {
        text id PK
        text owner_user_id FK
        text name
        text email
        text contract
        text status
        text submitted_at
        timestamptz created_at
        timestamptz updated_at
    }

    teacher_sandbox_availability {
        text sandbox_id FK
        text day_key
        int hour
    }

    teacher_sandbox_courses {
        text sandbox_id FK
        text course_id FK
        int position
    }

    app_users ||--o| teacher_profiles : "tiene perfil"
    app_users ||--o| teacher_sandboxes : "tiene sandbox"
    teacher_profiles ||--o{ teacher_availability : "disponibilidad"
    teacher_profiles ||--o{ teacher_courses : "cursos asignados"
    teacher_courses }o--|| courses : "referencia curso"
    teacher_sandboxes ||--o{ teacher_sandbox_availability : "disponibilidad sandbox"
    teacher_sandboxes ||--o{ teacher_sandbox_courses : "cursos sandbox"
    teacher_sandbox_courses }o--|| courses : "referencia curso"
```

## Diccionario de tablas

### app_users

Usuarios sincronizados desde Clerk via webhook. Cada fila corresponde a un usuario autenticado.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| clerk_user_id | text | PK | Identificador de Clerk, formato `user_xxx` |
| email | text | NOT NULL | Correo principal en minusculas |
| name | text | NOT NULL | Nombre de visualizacion |
| image_url | text | NOT NULL, default '' | URL de avatar de Clerk |
| role | text | NOT NULL, default 'docente', CHECK | Rol efectivo: `docente`, `direccion` o `admin` |
| school | text | NOT NULL, default 'Sin departamento' | Escuela o departamento del usuario |
| code | text | NOT NULL, default '' | Codigo docente institucional (opcional) |
| last_seen_at | timestamptz | nullable | Ultima actividad registrada |
| created_at | timestamptz | NOT NULL, default now() | Fecha de creacion |
| updated_at | timestamptz | NOT NULL, default now() | Fecha de ultima actualizacion |

### teacher_profiles

Perfil de disponibilidad de cada docente. Un docente puede tener a lo sumo un perfil. El estado sigue el flujo descrito en la seccion Invariantes.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| id | text | PK | Identificador interno del perfil |
| clerk_user_id | text | UNIQUE, FK -> app_users, ON DELETE SET NULL | Vinculo con el usuario Clerk |
| name | text | NOT NULL | Nombre del docente |
| email | text | NOT NULL | Correo del docente |
| contract | text | NOT NULL, CHECK | Tipo de contrato: `full`, `partial20`, `partial10` |
| status | text | NOT NULL, default 'borrador', CHECK | Estado del perfil (ver Invariantes) |
| review_note | text | NOT NULL, default '' | Observacion administrativa cuando status='observado' |
| submitted_at | text | nullable | Fecha ISO 8601 de envio |
| approved_at | text | nullable | Fecha ISO 8601 de aprobacion |
| teacher_code | text | nullable | Codigo institucional del docente |
| category | text | nullable | Categoria docente |
| academic_degree | text | nullable | Grado academico |
| department | text | nullable | Departamento academico |
| created_at | timestamptz | NOT NULL, default now() | Fecha de creacion |
| updated_at | timestamptz | NOT NULL, default now() | Fecha de ultima actualizacion |

### courses

Catalogo de cursos que puede dictar un docente. Administrado por el rol `admin`.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| id | text | PK | Identificador del curso |
| name | text | NOT NULL | Nombre del curso |
| school | text | NOT NULL | Escuela a la que pertenece |
| active | boolean | NOT NULL, default true | Si el curso aparece en el catalogo activo |
| is_thesis | boolean | NOT NULL, default false | Marca cursos de tesis (no cuentan para el limite de cursos) |
| code | text | nullable | Codigo de plan de estudios |
| cycle | int | nullable | Ciclo academico |
| credits | int | nullable | Creditos del curso |
| course_type | text | nullable | Tipo de curso |
| curriculum | text | nullable | Plan de estudios al que pertenece |

### teacher_availability

Franjas horarias registradas por un docente. Cada fila representa una hora disponible en un dia.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| teacher_id | text | PK (compuesto), FK -> teacher_profiles, ON DELETE CASCADE | Perfil docente |
| day_key | text | PK (compuesto) | Dia de la semana: `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado` |
| hour | int | PK (compuesto) | Hora en formato 8-21 |

### teacher_courses

Cursos asignados a un docente en un perfil. No se puede eliminar un curso si tiene asignaciones activas.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| teacher_id | text | PK (compuesto), FK -> teacher_profiles, ON DELETE CASCADE | Perfil docente |
| course_id | text | PK (compuesto), FK -> courses, ON DELETE RESTRICT | Curso del catalogo |
| position | int | NOT NULL, default 0 | Orden de visualizacion |

### app_settings

Parametros de configuracion global del sistema en formato clave-valor.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| key | text | PK | Nombre del parametro (ej. `academic_term`, `period_closed`) |
| value | text | NOT NULL | Valor serializado como texto |
| updated_at | timestamptz | NOT NULL, default now() | Fecha de ultima actualizacion |

### schedule_events

Registro de auditoria de eventos relevantes (envios, aprobaciones, observaciones, cierres de periodo).

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| id | bigint | PK, secuencia automatica | Identificador secuencial |
| teacher_id | text | NOT NULL | Perfil docente afectado (sin FK para preservar historial tras borrado) |
| actor_user_id | text | NOT NULL | Usuario que realizo la accion |
| event_type | text | NOT NULL | Tipo de evento (ej. `submit`, `approve`, `observe`) |
| metadata | jsonb | NOT NULL, default '{}' | Datos adicionales del evento |
| created_at | timestamptz | NOT NULL, default now() | Fecha del evento |

### teacher_sandboxes

Perfil de prueba que permite a un usuario de `direccion` o `admin` simular el flujo de un docente sin crear un perfil real.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| id | text | PK | Identificador del sandbox |
| owner_user_id | text | UNIQUE, FK -> app_users, ON DELETE CASCADE | Usuario propietario del sandbox |
| name | text | NOT NULL | Nombre para el sandbox |
| email | text | NOT NULL | Correo para el sandbox |
| contract | text | NOT NULL, CHECK | Tipo de contrato simulado |
| status | text | NOT NULL, default 'borrador', CHECK | Estado del sandbox (mismos valores que teacher_profiles) |
| submitted_at | text | nullable | Fecha ISO 8601 de envio simulado |
| created_at | timestamptz | NOT NULL, default now() | Fecha de creacion |
| updated_at | timestamptz | NOT NULL, default now() | Fecha de ultima actualizacion |

### teacher_sandbox_availability

Franjas horarias del sandbox. Estructura identica a `teacher_availability`.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| sandbox_id | text | PK (compuesto), FK -> teacher_sandboxes, ON DELETE CASCADE | Sandbox padre |
| day_key | text | PK (compuesto) | Dia de la semana |
| hour | int | PK (compuesto) | Hora en formato 8-21 |

### teacher_sandbox_courses

Cursos del sandbox. Estructura identica a `teacher_courses`.

| Columna | Tipo | Restricciones | Descripcion |
|---|---|---|---|
| sandbox_id | text | PK (compuesto), FK -> teacher_sandboxes, ON DELETE CASCADE | Sandbox padre |
| course_id | text | PK (compuesto), FK -> courses, ON DELETE RESTRICT | Curso del catalogo |
| position | int | NOT NULL, default 0 | Orden de visualizacion |

## Invariantes

### Flujo de estado de teacher_profiles

El campo `status` sigue el siguiente ciclo de vida:

```
borrador --> enviado --> aprobado
    ^            |
    |            v
    +------- observado
```

- `borrador`: el docente aun no ha enviado su disponibilidad.
- `enviado`: el docente envio y espera revision administrativa.
- `observado`: Direccion devolvio el perfil con una nota en `review_note`.
- `aprobado`: Direccion aprobo el horario.

Cuando un perfil pasa a `observado`, `review_note` contiene la observacion escrita por Direccion. Al reenviarlo, `review_note` se limpia.

### Reglas por tipo de contrato

Definidas en `src/lib/schedule-rules.ts` y `src/lib/schedule-data.ts`.

| Tipo | Clave | Horas totales | Horas diarias | Bloques de 4h por dia | Dias con bloque | Max cursos (sin tesis) |
|---|---|---|---|---|---|---|
| Tiempo completo | `full` | 40 | 8 | 2 | 5 | 3 |
| Tiempo parcial 20 h | `partial20` | 20 | 4 | 1 | 5 | 2 |
| Tiempo parcial 10 h | `partial10` | 12 | 4 | 1 | 3 | 1 |

Los cursos marcados con `is_thesis = true` no cuentan para el limite de cursos por contrato.

### Compuerta de periodo abierto

Toda mutacion de datos docentes llama internamente a `ensurePeriodOpen()`, que lee `app_settings.period_closed`. Si el valor es `'true'`, la operacion falla con HTTP 403. El campo `period_closed_at` registra el instante de cierre. Direccion o Admin pueden reabrir el periodo desde la pantalla de configuracion.
