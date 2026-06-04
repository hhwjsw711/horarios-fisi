import type { Course } from "@/lib/schedule-data";

export function courseBelongsToSchool(course: Course, schoolName: string) {
  return course.school === schoolName || course.school === "Transversal";
}

export function visibleCoursesForSchool(courses: Course[], schoolName: string) {
  return courses
    .filter((course) => course.active !== false)
    .filter((course) => courseBelongsToSchool(course, schoolName));
}
