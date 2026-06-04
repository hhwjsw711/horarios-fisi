import { redirect } from "next/navigation";
import { ScheduleApp } from "@/components/schedule-app";

export default function DemoPage() {
  if (process.env.NODE_ENV === "production") {
    redirect("/docente");
  }
  return <ScheduleApp view="docente" preview />;
}
