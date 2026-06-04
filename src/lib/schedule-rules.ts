import {
  type Course,
  contractRules,
  type DayKey,
  days,
  type TeacherProfile,
} from "@/lib/schedule-data";

export type ScheduleValidation = {
  selectedHours: number;
  countedCourses: number;
  blockDays: number;
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
    (dayHours) => maxConsecutive(dayHours) >= 4,
  ).length;
  const countedCourses = profile.courses.filter(
    (course) => !course.isThesis,
  ).length;
  return {
    selectedHours: profile.availability.length,
    countedCourses,
    blockDays,
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

function maxConsecutive(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  let max = 0;
  let current = 0;
  let previous = Number.NaN;
  for (const value of sorted) {
    current = value === previous + 1 ? current + 1 : 1;
    max = Math.max(max, current);
    previous = value;
  }
  return max;
}
