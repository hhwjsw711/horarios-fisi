import {
  ensureScheduleSchema,
  seedScheduleData,
  verifyScheduleSchema,
} from "../src/lib/data/schedule-db";

await ensureScheduleSchema();
await seedScheduleData({
  includeDemoTeachers: process.argv.includes("--demo"),
});
const verification = await verifyScheduleSchema();
const ready = Object.values(verification).every(Boolean);
console.log(JSON.stringify({ ready, verification }, null, 2));
if (!ready) {
  throw new Error("Schedule database verification failed.");
}
