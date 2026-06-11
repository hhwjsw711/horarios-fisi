# src/lib — layer map

| Folder | Layer | Rule |
|---|---|---|
| `domain/` | Domain | Pure types and logic; no Next.js, no DB, no auth |
| `data/` | Data | DB access via Neon; imports from `domain/` only |
| `api/` | API | Action runners and type unions; imports from `domain/` and `data/` |
| `auth/` | Auth | Clerk identity resolution; imports from `domain/` only |

Import rule: `front -> api -> domain <- data`. Domain imports nothing from `next/`, `data/`, or `api/`.

See `docs/architecture.md` for the full architecture overview.
