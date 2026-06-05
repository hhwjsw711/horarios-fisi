import { neon } from "@neondatabase/serverless";
import { normalizeDepartment } from "../src/lib/schedule-data";
import { type AppRole, ensureScheduleSchema } from "../src/lib/schedule-db";

type ClerkEmail = {
  email_address: string;
};

type ClerkUser = {
  id: string;
  email_addresses?: ClerkEmail[];
  first_name?: string | null;
  image_url?: string | null;
  last_name?: string | null;
  public_metadata?: Record<string, unknown> | null;
};

const args = process.argv.slice(2);
const adminEmails =
  valuesAfter("--admin-email").map((email) => email.toLowerCase()) ?? [];
const selectedAdminEmails = adminEmails.length
  ? adminEmails
  : ["raillyhugo@gmail.com", "hpaucar@unmsm.edu.pe"];
const resetNonAdmins = !args.includes("--preserve-non-admin-roles");
const defaultSchool = normalizeDepartment(valueAfter("--school"));

if (!process.env.CLERK_SECRET_KEY) {
  throw new Error("CLERK_SECRET_KEY is required.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required.");
}

const users = await listClerkUsers();
const usersByEmail = new Map(
  users
    .map((user) => [primaryEmail(user), user] as const)
    .filter(([email]) => email),
);
const missingAdmins = selectedAdminEmails.filter(
  (email) => !usersByEmail.has(email),
);
if (missingAdmins.length) {
  throw new Error(
    `Admin users not found in Clerk: ${missingAdmins.join(", ")}`,
  );
}

const adminSet = new Set(selectedAdminEmails);
const updates = users
  .map((user) => {
    const email = primaryEmail(user);
    if (!email) {
      return null;
    }
    const role: AppRole = adminSet.has(email) ? "admin" : "docente";
    if (!resetNonAdmins && role !== "admin") {
      return null;
    }
    return { email, role, user };
  })
  .filter(Boolean) as { email: string; role: AppRole; user: ClerkUser }[];

for (const update of updates) {
  await updateClerkRole(update.user.id, update.role);
}

await ensureScheduleSchema();
const sql = neon(process.env.DATABASE_URL);
const teacherRows = (await sql.query(
  "select lower(email) as email, teacher_code, department from teacher_profiles",
)) as {
  email: string;
  teacher_code: string | null;
  department: string | null;
}[];
const teacherCodeByEmail = new Map(
  teacherRows.map((row) => [row.email, row.teacher_code?.trim() ?? ""]),
);
const teacherDepartmentByEmail = new Map(
  teacherRows.map((row) => [row.email, normalizeDepartment(row.department)]),
);

for (const update of updates) {
  const code =
    update.role === "admin"
      ? "ADMIN"
      : (teacherCodeByEmail.get(update.email) ?? "");
  const school =
    update.role === "docente"
      ? (teacherDepartmentByEmail.get(update.email) ?? defaultSchool)
      : defaultSchool;
  await sql.query(
    `
      insert into app_users (clerk_user_id, email, name, image_url, role, school, code)
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (clerk_user_id) do update set
        email = excluded.email,
        name = excluded.name,
        image_url = excluded.image_url,
        role = excluded.role,
        code = case
          when excluded.role = 'admin' then 'ADMIN'
          when app_users.code = '' and excluded.code <> '' then excluded.code
          else app_users.code
        end,
        updated_at = now()
    `,
    [
      update.user.id,
      update.email,
      displayName(update.user, update.email),
      update.user.image_url ?? "",
      update.role,
      school,
      code,
    ],
  );
}

console.log(
  JSON.stringify(
    {
      admins: selectedAdminEmails,
      clerkUsers: users.length,
      updated: updates.length,
      resetNonAdmins,
    },
    null,
    2,
  ),
);

function valueAfter(flag: string) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function valuesAfter(flag: string) {
  return args.flatMap((arg, index) =>
    arg === flag && args[index + 1] ? [args[index + 1]] : [],
  );
}

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

async function updateClerkRole(userId: string, role: AppRole) {
  const response = await fetch(
    `https://api.clerk.com/v1/users/${userId}/metadata`,
    {
      body: JSON.stringify({ public_metadata: { role } }),
      headers: {
        Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    },
  );
  if (!response.ok) {
    throw new Error(`Clerk metadata update failed for ${userId}.`);
  }
}

function primaryEmail(user: ClerkUser) {
  return user.email_addresses?.[0]?.email_address.toLowerCase() ?? "";
}

function displayName(user: ClerkUser, email: string) {
  const name = [user.first_name, user.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || email.split("@")[0] || "Docente UNMSM";
}
