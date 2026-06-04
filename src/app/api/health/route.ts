import { NextResponse } from "next/server";
import { verifyScheduleSchema } from "@/lib/schedule-db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const schema = await verifyScheduleSchema();
    const schemaReady = Object.values(schema).every(Boolean);
    return NextResponse.json(
      {
        ok: schemaReady,
        service: "horarios-unmsm",
        checks: {
          database: true,
          schema: schemaReady,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: schemaReady ? 200 : 503,
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: "horarios-unmsm",
        checks: {
          database: false,
          schema: false,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}
