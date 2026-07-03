import { redirect } from "next/navigation";
import { ScheduleApp, type ViewKey } from "@/components/schedule-app";
import type { Locale } from "@/i18n/routing";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";
import { getSchedulePayload } from "@/lib/data/schedule-db";

export async function ScheduleRoute({
  locale,
  view,
}: {
  locale: Locale;
  view: ViewKey;
}) {
  const identity = await resolveScheduleIdentity();
  if (!identity) {
    redirect(`/${locale}/sign-in`);
  }
  const payload = await getSchedulePayload(identity);
  if (!payload.onboarding.complete) {
    redirect(`/${locale}/onboarding`);
  }
  return <ScheduleApp initialData={payload} view={view} />;
}
