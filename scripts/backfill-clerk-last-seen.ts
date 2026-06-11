import { neon } from "@neondatabase/serverless";
import { verifyScheduleSchema } from "../src/lib/data/schedule-db";

type ClerkUser = {
  id: string;
  last_sign_in_at?: number | string | null;
};

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const verification = await verifyScheduleSchema();
if (!verification.appUsersLastSeenAtColumn) {
  throw new Error("Run db:migrate before clerk:backfill:last-seen.");
}

const sql = neon(process.env.DATABASE_URL);
const users = await listClerkUsers();
let signedInUsers = 0;
let updatedUsers = 0;
const updated: { email: string; lastSeenAt: string }[] = [];

for (const user of users) {
  const lastSeenAt = parseClerkTimestamp(user.last_sign_in_at);
  if (!lastSeenAt) {
    continue;
  }
  signedInUsers += 1;
  const rows = (await sql.query(
    `
      update app_users
      set last_seen_at = greatest(coalesce(last_seen_at, $2::timestamptz), $2::timestamptz)
      where clerk_user_id = $1
      returning email, last_seen_at::text
    `,
    [user.id, lastSeenAt.toISOString()],
  )) as { email: string; last_seen_at: string }[];
  if (rows[0]) {
    updatedUsers += 1;
    updated.push({
      email: rows[0].email,
      lastSeenAt: rows[0].last_seen_at,
    });
  }
}

console.log(
  JSON.stringify(
    {
      clerkUsers: users.length,
      signedInUsers,
      updatedUsers,
      unmatchedSignedInUsers: signedInUsers - updatedUsers,
      updated,
    },
    null,
    2,
  ),
);

async function listClerkUsers() {
  const users: ClerkUser[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetch(
      `https://api.clerk.com/v1/users?limit=100&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        },
      },
    );
    if (!response.ok) {
      throw new Error(`Clerk users list failed: ${response.status}`);
    }
    const page = (await response.json()) as ClerkUser[];
    users.push(...page);
    if (page.length < 100) {
      return users;
    }
  }
}

function parseClerkTimestamp(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsedValue =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  const date =
    typeof parsedValue === "number"
      ? new Date(parsedValue)
      : new Date(String(parsedValue));
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}
