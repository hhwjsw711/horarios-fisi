import { redirect } from "next/navigation";
import { ScheduleApp } from "@/components/schedule-app";
import { isLocale, localePath } from "@/i18n/routing";
import { resolveScheduleIdentity } from "@/lib/auth/schedule-identity";
import { getSchedulePayload } from "@/lib/data/schedule-db";

export default async function DemoPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    redirect("/es");
  }
  if (process.env.NODE_ENV === "production") {
    redirect(localePath(lang, "/teacher"));
  }
  const identity = await resolveScheduleIdentity({ preview: true });
  if (!identity) {
    redirect(localePath(lang, "/sign-in"));
  }
  const payload = await getSchedulePayload(identity);
  return <ScheduleApp initialData={payload} view="docente" preview />;
}
