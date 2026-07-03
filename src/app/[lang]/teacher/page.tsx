import { ScheduleRoute } from "@/components/schedule-route";
import { isLocale } from "@/i18n/routing";

export default async function DocentePage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    return null;
  }
  return <ScheduleRoute locale={lang} view="docente" />;
}
