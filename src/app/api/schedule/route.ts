import { type NextRequest, NextResponse } from "next/server";
import { runScheduleAction } from "@/lib/api/schedule-action-runner";
import { getSchedulePayload } from "@/lib/data/schedule-db";
import type { ScheduleIdentity } from "@/lib/domain/types";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";

export async function GET(request: NextRequest) {
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await getSchedulePayload(identity));
}

export async function PATCH(request: NextRequest) {
  const identity = await resolveIdentity(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const result = await runScheduleAction(identity, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.data);
}

async function resolveIdentity(
  request: NextRequest,
): Promise<ScheduleIdentity | null> {
  const preview =
    process.env.NODE_ENV !== "production" &&
    request.nextUrl.searchParams.get("preview") === "1";
  return resolveScheduleIdentity({ preview });
}
