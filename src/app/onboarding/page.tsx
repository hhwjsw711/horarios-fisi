import { redirect } from "next/navigation";
import { OnboardingRouteApp } from "@/components/schedule-app";
import { getSchedulePayload } from "@/lib/data/schedule-db";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";

export default async function OnboardingPage() {
  const identity = await resolveScheduleIdentity();
  if (!identity) {
    redirect("/sign-in");
  }
  const payload = await getSchedulePayload(identity);
  if (payload.onboarding.complete) {
    redirect(payload.canUseDirection ? "/direccion" : "/docente");
  }
  return <OnboardingRouteApp initialData={payload} />;
}
