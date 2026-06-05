import { redirect } from "next/navigation";
import { ScheduleApp } from "@/components/schedule-app";
import { getSchedulePayload } from "@/lib/schedule-db";
import { resolveScheduleIdentity } from "@/lib/schedule-identity";

export default async function DemoPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/docente");
  }
  const identity = await resolveScheduleIdentity({ preview: true });
  if (!identity) {
    redirect("/sign-in");
  }
  const payload = await getSchedulePayload(identity);
  return <ScheduleApp initialData={payload} view="docente" preview />;
}
