import { ensureScheduleSchema, seedScheduleData } from "../src/lib/schedule-db";

await ensureScheduleSchema();
await seedScheduleData();
console.log("Schedule database is ready.");
