import { Show } from "@clerk/nextjs";
import { ScheduleApp, SignedOutShell } from "@/components/schedule-app";

export default function Home() {
  return (
    <Show when="signed-in" fallback={<SignedOutShell />}>
      <ScheduleApp />
    </Show>
  );
}
