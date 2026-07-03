import { redirect } from "next/navigation";
import { OnboardingRouteApp } from "@/components/schedule-app";
import { isLocale, localePath } from "@/i18n/routing";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";
import { getSchedulePayload } from "@/lib/data/schedule-db";

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    redirect("/es");
  }
  const identity = await resolveScheduleIdentity();
  if (!identity) {
    redirect(localePath(lang, "/sign-in"));
  }
  const payload = await getSchedulePayload(identity);
  if (payload.onboarding.complete) {
    redirect(
      payload.canUseDirection
        ? localePath(lang, "/direction")
        : localePath(lang, "/teacher"),
    );
  }
  return <OnboardingRouteApp initialData={payload} />;
}
