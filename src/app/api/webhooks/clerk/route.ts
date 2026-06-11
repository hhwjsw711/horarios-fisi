import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";
import { deleteClerkUser, syncClerkUser } from "@/lib/schedule-db";
import type { AppRole } from "@/lib/domain/types";

type ClerkEmail = {
  id: string;
  email_address: string;
};

type ClerkUserPayload = {
  id?: string;
  first_name?: string | null;
  image_url?: string | null;
  last_name?: string | null;
  primary_email_address_id?: string | null;
  public_metadata?: Record<string, unknown>;
  email_addresses?: ClerkEmail[];
};

export async function POST(req: NextRequest) {
  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(req);
  } catch (error) {
    console.error("clerk webhook verification failed", error);
    return Response.json({ error: "Invalid webhook" }, { status: 400 });
  }

  try {
    const data = event.data as ClerkUserPayload;
    if (event.type === "user.deleted") {
      if (data.id) {
        await deleteClerkUser(data.id);
      }
      return Response.json({ received: true });
    }
    if (event.type === "user.created" || event.type === "user.updated") {
      const email = primaryEmail(data);
      if (data.id && email) {
        await syncClerkUser({
          clerkUserId: data.id,
          email,
          imageUrl: data.image_url ?? undefined,
          name: displayName(data, email),
          role: isRole(data.public_metadata?.role)
            ? data.public_metadata.role
            : undefined,
        });
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    console.error(
      "clerk webhook processing failed",
      { type: event.type },
      error,
    );
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}

function isRole(value: unknown): value is AppRole {
  return value === "docente" || value === "direccion" || value === "admin";
}

function primaryEmail(data: ClerkUserPayload) {
  const primary = data.email_addresses?.find(
    (email) => email.id === data.primary_email_address_id,
  );
  return (
    primary?.email_address ??
    data.email_addresses?.[0]?.email_address ??
    ""
  ).toLowerCase();
}

function displayName(data: ClerkUserPayload, email: string) {
  const name = [data.first_name, data.last_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  return name || email.split("@")[0] || "Docente UNMSM";
}
