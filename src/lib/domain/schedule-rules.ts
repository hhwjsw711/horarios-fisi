import {
  type Course,
  contractRules,
  type DayKey,
  days,
  type TeacherProfile,
} from "@/lib/domain/schedule-data";

export type ScheduleValidation = {
  selectedHours: number;
  countedCourses: number;
  blockDays: number;
  missingDailyBlockDays: number;
  complete: boolean;
};

export type CourseAssignmentState = {
  alreadyAssigned: boolean;
  countedCourses: number;
  limitReached: boolean;
  canAssign: boolean;
};

export function validateTeacherRules(
  profile: Pick<TeacherProfile, "availability" | "contract" | "courses">,
): ScheduleValidation {
  const rule = contractRules[profile.contract];
  const byDay = new Map<DayKey, number[]>();
  for (const day of days) {
    byDay.set(day.key, []);
  }
  for (const key of profile.availability) {
    const [day, hour] = key.split("-");
    const values = byDay.get(day as DayKey);
    if (values) {
      values.push(Number(hour));
    }
  }
  const blockDays = Array.from(byDay.values()).filter(
    (dayHours) =>
      new Set(dayHours).size >= rule.requiredDailyHours &&
      countFourHourBlocks(dayHours) >= rule.requiredDailyBlockCount,
  ).length;
  const countedCourses = profile.courses.filter(
    (course) => !course.isThesis,
  ).length;
  const missingDailyBlockDays = Math.max(0, rule.requiredBlockDays - blockDays);
  return {
    selectedHours: profile.availability.length,
    countedCourses,
    blockDays,
    missingDailyBlockDays,
    complete:
      profile.availability.length >= rule.requiredHours &&
      blockDays >= rule.requiredBlockDays &&
      countedCourses > 0 &&
      countedCourses <= rule.maxCourses,
  };
}

export function completionForRules(
  profile: Pick<TeacherProfile, "contract">,
  validation: ScheduleValidation,
) {
  return Math.min(
    100,
    Math.round(
      (validation.selectedHours /
        contractRules[profile.contract].requiredHours) *
        70 +
        (validation.blockDays /
          contractRules[profile.contract].requiredBlockDays) *
          20 +
        (validation.countedCourses /
          contractRules[profile.contract].maxCourses) *
          10,
    ),
  );
}

export function courseAssignmentState(
  profile: Pick<TeacherProfile, "contract" | "courses">,
  course?: Course | null,
): CourseAssignmentState {
  const alreadyAssigned = course
    ? profile.courses.some((item) => item.id === course.id)
    : false;
  const countedCourses = profile.courses.filter(
    (item) => !item.isThesis,
  ).length;
  const limitReached = Boolean(
    course &&
      !alreadyAssigned &&
      !course.isThesis &&
      countedCourses >= contractRules[profile.contract].maxCourses,
  );
  return {
    alreadyAssigned,
    countedCourses,
    limitReached,
    canAssign: Boolean(course && !alreadyAssigned && !limitReached),
  };
}

function countFourHourBlocks(values: number[]) {
  const sorted = Array.from(new Set(values)).sort((a, b) => a - b);
  let blocks = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const value of sorted) {
    if (value === previous + 1) {
      run += 1;
    } else {
      blocks += Math.floor(run / 4);
      run = 1;
    }
    previous = value;
  }
  blocks += Math.floor(run / 4);
  return blocks;
}
