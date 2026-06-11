import { auth, currentUser } from "@clerk/nextjs/server";
import type { AppRole, ScheduleIdentity } from "@/lib/domain/types";

export function isAppRole(value: unknown): value is AppRole {
  return value === "docente" || value === "direccion" || value === "admin";
}

export async function resolveScheduleIdentity({
  preview = false,
}: {
  preview?: boolean;
} = {}): Promise<ScheduleIdentity | null> {
  if (process.env.NODE_ENV !== "production" && preview) {
    return localPreviewIdentity();
  }
  try {
    const { userId } = await auth();
    if (userId) {
      const user = await currentUser();
      const role = isAppRole(user?.publicMetadata?.role)
        ? user.publicMetadata.role
        : undefined;
      return {
        clerkUserId: userId,
        email:
          user?.primaryEmailAddress?.emailAddress ?? `${userId}@unmsm.edu.pe`,
        imageUrl: user?.imageUrl,
        name: user?.fullName ?? user?.firstName ?? "Docente UNMSM",
        role,
      };
    }
  } catch {
    if (process.env.NODE_ENV === "production") {
      return null;
    }
  }
  if (process.env.NODE_ENV !== "production") {
    return localPreviewIdentity();
  }
  return null;
}

function localPreviewIdentity(): ScheduleIdentity {
  return {
    clerkUserId: "local-preview",
    email: "preview@unmsm.edu.pe",
    name: "Vista local",
    preview: true,
  };
}
