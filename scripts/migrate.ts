import { ensureScheduleSchema, seedScheduleData } from "../src/lib/schedule-db";

await ensureScheduleSchema();
await seedScheduleData({
  includeDemoTeachers: process.argv.includes("--demo"),
});
console.log("Schedule database is ready.");
