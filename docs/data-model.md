# Data Model

Source of truth: `src/lib/schedule-db.ts`, function `ensureScheduleSchema()`.

## Entity-relationship diagram

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

    app_users ||--o| teacher_profiles : "has profile"
    app_users ||--o| teacher_sandboxes : "has sandbox"
    teacher_profiles ||--o{ teacher_availability : "availability"
    teacher_profiles ||--o{ teacher_courses : "assigned courses"
    teacher_courses }o--|| courses : "references course"
    teacher_sandboxes ||--o{ teacher_sandbox_availability : "sandbox availability"
    teacher_sandboxes ||--o{ teacher_sandbox_courses : "sandbox courses"
    teacher_sandbox_courses }o--|| courses : "references course"
```

## Table dictionary

### app_users

Users synced from Clerk via webhook. Each row corresponds to one authenticated user.

| Column | Type | Constraints | Description |
|---|---|---|---|
| clerk_user_id | text | PK | Clerk identifier, format `user_xxx` |
| email | text | NOT NULL | Primary email in lowercase |
| name | text | NOT NULL | Display name |
| image_url | text | NOT NULL, default '' | Clerk avatar URL |
| role | text | NOT NULL, default 'docente', CHECK | Effective role: `docente`, `direccion`, or `admin` |
| school | text | NOT NULL, default 'Sin departamento' | User's school or department |
| code | text | NOT NULL, default '' | Institutional teacher code (optional) |
| last_seen_at | timestamptz | nullable | Last recorded activity |
| created_at | timestamptz | NOT NULL, default now() | Creation date |
| updated_at | timestamptz | NOT NULL, default now() | Last update date |

### teacher_profiles

Availability profile for each teacher. A teacher can have at most one profile. The status follows the lifecycle described in the Invariants section.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | text | PK | Internal profile identifier |
| clerk_user_id | text | UNIQUE, FK -> app_users, ON DELETE SET NULL | Link to the Clerk user |
| name | text | NOT NULL | Teacher name |
| email | text | NOT NULL | Teacher email |
| contract | text | NOT NULL, CHECK | Contract type: `full`, `partial20`, `partial10` |
| status | text | NOT NULL, default 'borrador', CHECK | Profile status (see Invariants) |
| review_note | text | NOT NULL, default '' | Administrative observation when status='observado' |
| submitted_at | text | nullable | ISO 8601 submission date |
| approved_at | text | nullable | ISO 8601 approval date |
| teacher_code | text | nullable | Institutional teacher code |
| category | text | nullable | Teacher category |
| academic_degree | text | nullable | Academic degree |
| department | text | nullable | Academic department |
| created_at | timestamptz | NOT NULL, default now() | Creation date |
| updated_at | timestamptz | NOT NULL, default now() | Last update date |

### courses

Course catalog that a teacher can teach. Managed by the `admin` role.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | text | PK | Course identifier |
| name | text | NOT NULL | Course name |
| school | text | NOT NULL | School the course belongs to |
| active | boolean | NOT NULL, default true | Whether the course appears in the active catalog |
| is_thesis | boolean | NOT NULL, default false | Marks thesis courses (do not count toward the course limit) |
| code | text | nullable | Study plan code |
| cycle | int | nullable | Academic cycle |
| credits | int | nullable | Course credits |
| course_type | text | nullable | Course type |
| curriculum | text | nullable | Study plan the course belongs to |

### teacher_availability

Time slots registered by a teacher. Each row represents one available hour on a given day.

| Column | Type | Constraints | Description |
|---|---|---|---|
| teacher_id | text | PK (composite), FK -> teacher_profiles, ON DELETE CASCADE | Teacher profile |
| day_key | text | PK (composite) | Day of the week: `lunes`, `martes`, `miercoles`, `jueves`, `viernes`, `sabado` |
| hour | int | PK (composite) | Hour in 8-21 format |

### teacher_courses

Courses assigned to a teacher in a profile. A course cannot be removed if it has active assignments.

| Column | Type | Constraints | Description |
|---|---|---|---|
| teacher_id | text | PK (composite), FK -> teacher_profiles, ON DELETE CASCADE | Teacher profile |
| course_id | text | PK (composite), FK -> courses, ON DELETE RESTRICT | Catalog course |
| position | int | NOT NULL, default 0 | Display order |

### app_settings

Global system configuration parameters in key-value format.

| Column | Type | Constraints | Description |
|---|---|---|---|
| key | text | PK | Parameter name (e.g. `academic_term`, `period_closed`) |
| value | text | NOT NULL | Value serialized as text |
| updated_at | timestamptz | NOT NULL, default now() | Last update date |

### schedule_events

Audit log of relevant events (submissions, approvals, observations, period closures).

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | bigint | PK, auto sequence | Sequential identifier |
| teacher_id | text | NOT NULL | Affected teacher profile (no FK to preserve history after deletion) |
| actor_user_id | text | NOT NULL | User who performed the action |
| event_type | text | NOT NULL | Event type (e.g. `submit`, `approve`, `observe`) |
| metadata | jsonb | NOT NULL, default '{}' | Additional event data |
| created_at | timestamptz | NOT NULL, default now() | Event date |

### teacher_sandboxes

Test profile that allows a `direccion` or `admin` user to simulate the teacher flow without creating a real profile.

| Column | Type | Constraints | Description |
|---|---|---|---|
| id | text | PK | Sandbox identifier |
| owner_user_id | text | UNIQUE, FK -> app_users, ON DELETE CASCADE | Owning user |
| name | text | NOT NULL | Name for the sandbox |
| email | text | NOT NULL | Email for the sandbox |
| contract | text | NOT NULL, CHECK | Simulated contract type |
| status | text | NOT NULL, default 'borrador', CHECK | Sandbox status (same values as teacher_profiles) |
| submitted_at | text | nullable | ISO 8601 simulated submission date |
| created_at | timestamptz | NOT NULL, default now() | Creation date |
| updated_at | timestamptz | NOT NULL, default now() | Last update date |

### teacher_sandbox_availability

Sandbox time slots. Identical structure to `teacher_availability`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| sandbox_id | text | PK (composite), FK -> teacher_sandboxes, ON DELETE CASCADE | Parent sandbox |
| day_key | text | PK (composite) | Day of the week |
| hour | int | PK (composite) | Hour in 8-21 format |

### teacher_sandbox_courses

Sandbox courses. Identical structure to `teacher_courses`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| sandbox_id | text | PK (composite), FK -> teacher_sandboxes, ON DELETE CASCADE | Parent sandbox |
| course_id | text | PK (composite), FK -> courses, ON DELETE RESTRICT | Catalog course |
| position | int | NOT NULL, default 0 | Display order |

## Invariants

### teacher_profiles status lifecycle

The `status` field follows this lifecycle:

```
borrador --> enviado --> aprobado
    ^            |
    |            v
    +------- observado
```

- `borrador`: the teacher has not yet submitted their availability.
- `enviado`: the teacher submitted and is awaiting administrative review.
- `observado`: the Direction office returned the profile with a note in `review_note`.
- `aprobado`: the Direction office approved the schedule.

When a profile transitions to `observado`, `review_note` contains the observation written by the Direction office. When the teacher resubmits, `review_note` is cleared.

### Rules by contract type

Defined in `src/lib/schedule-rules.ts` and `src/lib/schedule-data.ts`.

| Type | Key | Total hours | Daily hours | 4h blocks per day | Days with block | Max courses (excl. thesis) |
|---|---|---|---|---|---|---|
| Full-time | `full` | 40 | 8 | 2 | 5 | 3 |
| Part-time 20 h | `partial20` | 20 | 4 | 1 | 5 | 2 |
| Part-time 10 h | `partial10` | 12 | 4 | 1 | 3 | 1 |

Courses marked with `is_thesis = true` do not count toward the per-contract course limit.

### Period-open gate

Every teacher data mutation internally calls `ensurePeriodOpen()`, which reads `app_settings.period_closed`. If the value is `'true'`, the operation fails with HTTP 403. The `period_closed_at` field records the closure timestamp. The Direction or Admin roles can reopen the period from the settings screen.
