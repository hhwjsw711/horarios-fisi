import { redirect } from "next/navigation";
import { ScheduleApp, type ViewKey } from "@/components/schedule-app";
import { getSchedulePayload } from "@/lib/data/schedule-db";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";

export async function ScheduleRoute({ view }: { view: ViewKey }) {
  const identity = await resolveScheduleIdentity();
  if (!identity) {
    redirect("/sign-in");
  }
  const payload = await getSchedulePayload(identity);
  if (!payload.onboarding.complete) {
    redirect("/onboarding");
  }
  return <ScheduleApp initialData={payload} view={view} />;
}
