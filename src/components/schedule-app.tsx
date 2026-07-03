"use client";

import { SignInButton, SignOutButton, UserButton } from "@clerk/nextjs";
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  FileSpreadsheet,
  Files,
  GraduationCap,
  History,
  Home,
  Info,
  LockKeyhole,
  Moon,
  Plus,
  Save,
  Send,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  Upload,
  UserCog,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  completeOnboardingMutation,
  runScheduleMutation,
  runTeacherCourseImport,
} from "@/app/schedule-actions";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Toolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/ui/toolbar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link, useRouter } from "@/i18n/navigation";
import type { ScheduleMutationAction } from "@/lib/api/schedule-action-types";
import { visibleCoursesForSchool } from "@/lib/domain/schedule-courses";
import {
  type ContractKey,
  type Course,
  contractRules,
  courseCatalog,
  type DayKey,
  days,
  departments,
  formatHour,
  hours,
  schools,
  slotKey,
  type TeacherProfile,
} from "@/lib/domain/schedule-data";
import {
  completionForRules,
  courseAssignmentState,
  type ScheduleValidation,
  validateTeacherRules,
} from "@/lib/domain/schedule-rules";
import type {
  AppRole,
  Onboarding,
  ScheduleEvent,
  SchedulePayload,
  ScheduleUser,
  TeacherCourseImportResponse,
} from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export type ViewKey =
  | "docente"
  | "direccion"
  | "configuracion"
  | "usuarios"
  | "auditoria";

type Validation = ScheduleValidation;
type TeacherStatusFilter = TeacherProfile["status"] | "all";
type UserRoleFilter = AppRole | "all";
type UserOnboardingFilter = "all" | "complete" | "pending";
type CourseStatusFilter = "all" | "active" | "suspended";
type TeacherStatusCounts = Record<TeacherProfile["status"], number>;

type ApiError = {
  error?: string;
};

const schedulePayloadCache = new Map<string, SchedulePayload>();
const loadingScheduleCells = Array.from(
  { length: 105 },
  (_, index) => `loading-schedule-cell-${index}`,
);

async function readApiError(response: Response, fallback: string) {
  try {
    const payload = (await response.json()) as ApiError;
    return payload.error || fallback;
  } catch {
    return fallback;
  }
}

function toastKey(error: string) {
  return error.startsWith("toast.") ? error.slice("toast.".length) : error;
}

function initialCourseSchool(payload: SchedulePayload) {
  return payload.profile.courses[0]?.school ?? payload.schools[0] ?? schools[0];
}

function initialCourseId(payload: SchedulePayload, school: string) {
  const activeCatalog = payload.catalog.filter(
    (course) => course.active !== false,
  );
  return (
    visibleCoursesForSchool(activeCatalog, school)[0]?.id ?? courseCatalog[0].id
  );
}

export function ScheduleApp({
  initialData,
  preview = false,
  view,
}: {
  initialData?: SchedulePayload;
  preview?: boolean;
  view: ViewKey;
}) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("toast");
  const tFrame = useTranslations("scheduleFrame");
  const tStatus = useTranslations("status");
  const tRoutes = useTranslations("routes");
  const tContracts = useTranslations("contracts");
  const tMisc = useTranslations("misc");
  const tPrint = useTranslations("print");
  const tDays = useTranslations("days");
  const tRules = useTranslations("ruleMessages");
  const endpoint = preview ? "/api/schedule?preview=1" : "/api/schedule";
  const useServerActions = Boolean(initialData) && !preview;
  const [data, setData] = useState<SchedulePayload | null>(
    () => initialData ?? schedulePayloadCache.get(endpoint) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    () => initialData?.profile.id ?? null,
  );
  const [school, setSchool] = useState(() =>
    initialData ? initialCourseSchool(initialData) : schools[0],
  );
  const [courseId, setCourseId] = useState(() =>
    initialData
      ? initialCourseId(initialData, initialCourseSchool(initialData))
      : courseCatalog[0].id,
  );
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [teacherQuery, setTeacherQuery] = useState("");
  const [teacherStatusFilter, setTeacherStatusFilter] =
    useState<TeacherStatusFilter>("all");
  const [saving, setSaving] = useState(false);
  const [availabilitySaving, setAvailabilitySaving] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [courseSavingIds, setCourseSavingIds] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState("");
  const availabilityMutationRef = useRef(0);
  const teacherCourseMutationRef = useRef(new Map<string, number>());

  const writeData = useCallback(
    (payload: SchedulePayload) => {
      schedulePayloadCache.set(endpoint, payload);
      setData(payload);
    },
    [endpoint],
  );

  const updateData = useCallback(
    (updater: (current: SchedulePayload) => SchedulePayload) => {
      setData((current) => {
        if (!current) {
          return current;
        }
        const next = updater(current);
        schedulePayloadCache.set(endpoint, next);
        return next;
      });
    },
    [endpoint],
  );

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      setError(t("loadInstitutionFailed"));
      return;
    }
    const payload = (await response.json()) as SchedulePayload;
    writeData(payload);
    const nextSchool = initialCourseSchool(payload);
    const visibleCatalog = visibleCoursesForSchool(payload.catalog, nextSchool);
    setSchool(nextSchool);
    setCourseId((current) =>
      visibleCatalog.some((course) => course.id === current)
        ? current
        : (visibleCatalog[0]?.id ?? current),
    );
    setSelectedTeacherId((current) => current ?? payload.profile.id);
  }, [endpoint, t, writeData]);

  useEffect(() => {
    if (initialData) {
      schedulePayloadCache.set(endpoint, initialData);
      return;
    }
    load();
  }, [endpoint, initialData, load]);

  useEffect(() => {
    if (!preview && data && !data.onboarding.complete) {
      router.replace("/onboarding");
    }
  }, [data, preview, router]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const visibleCatalog = visibleCoursesForSchool(data.catalog, school);
    if (
      visibleCatalog.length &&
      !visibleCatalog.some((course) => course.id === courseId)
    ) {
      setCourseId(visibleCatalog[0].id);
    }
  }, [courseId, data, school]);

  useEffect(() => {
    if (!data || view !== "direccion" || !data.canUseDirection) {
      return;
    }
    const nextTeachers = filterTeachers(data.teachers, {
      query: teacherQuery,
      showOnlyPending,
      statusFilter: teacherStatusFilter,
      t: tStatus,
      tContracts,
    });
    if (!nextTeachers.length) {
      return;
    }
    if (nextTeachers.some((teacher) => teacher.id === selectedTeacherId)) {
      return;
    }
    setSelectedTeacherId(nextTeachers[0].id);
    setReviewNote(nextTeachers[0].reviewNote ?? "");
  }, [
    data,
    selectedTeacherId,
    showOnlyPending,
    teacherQuery,
    teacherStatusFilter,
    tContracts,
    tStatus,
    view,
  ]);

  const request = async (
    body: ScheduleMutationAction,
    options: { commitPayload?: boolean; showSaving?: boolean } = {},
  ) => {
    const showSaving = options.showSaving ?? true;
    if (showSaving) {
      setSaving(true);
    }
    try {
      if (useServerActions) {
        const result = await runScheduleMutation(body);
        if (!result.ok) {
          const errKey = result.error ?? "";
          toast.error(
            errKey.startsWith("toast.")
              ? t(toastKey(errKey) as never)
              : errKey || t("saveChangeFailed"),
          );
          return null;
        }
        if (options.commitPayload !== false) {
          writeData(result.payload);
        }
        return result.payload;
      }
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const apiError = await readApiError(response, t("saveChangeFailed"));
        toast.error(
          apiError.startsWith("toast.")
            ? t(toastKey(apiError) as never)
            : apiError,
        );
        return null;
      }
      const payload = (await response.json()) as SchedulePayload;
      if (options.commitPayload !== false) {
        writeData(payload);
      }
      return payload;
    } catch {
      toast.error(t("connectFailed"));
      return null;
    } finally {
      if (showSaving) {
        setSaving(false);
      }
    }
  };

  if (error) {
    return <AppError error={error} onRetry={load} />;
  }

  if (!data) {
    return <AppLoading />;
  }

  const profile = data.profile;
  const allTeachers = data.teachers;
  const filteredTeachers = filterTeachers(allTeachers, {
    query: teacherQuery,
    showOnlyPending,
    statusFilter: teacherStatusFilter,
    t: tStatus,
    tContracts,
  });
  const selectedTeacher =
    allTeachers.find((teacher) => teacher.id === selectedTeacherId) ?? profile;
  const selectedTeacherVisible = filteredTeachers.some(
    (teacher) => teacher.id === selectedTeacher.id,
  );
  const selectedEvents = data.events.filter(
    (event) => event.teacherId === selectedTeacher.id,
  );
  const validation = validateTeacherRules(profile);
  const selectedValidation = validateTeacherRules(selectedTeacher);
  const academicTerm = data.settings.academicTerm;
  const periodClosed = data.settings.periodClosed;
  const activeCatalog = data.catalog.filter(
    (course) => course.active !== false,
  );
  const schoolOptions = data.schools.length ? data.schools : schools;
  const departmentOptions = data.departments.length
    ? data.departments
    : departments;
  const catalogForSchool = visibleCoursesForSchool(activeCatalog, school);
  const completion = completionFor(profile, validation);
  const canUseAdmin = data.canUseAdmin;
  const canUseDirection = data.canUseDirection;
  const teacherMode = data.teacherMode;
  const showClerkControls = process.env.NODE_ENV === "production" && !preview;
  const approvedCount = data.teachers.filter(
    (teacher) => teacher.status === "aprobado",
  ).length;
  const pendingCount = data.teachers.length - approvedCount;
  const reviewCompletion = data.teachers.length
    ? Math.round((approvedCount / data.teachers.length) * 100)
    : 0;
  const reviewCounts = countTeachersByStatus(data.teachers);
  const sidebarCompletion =
    canUseDirection && view !== "docente" ? reviewCompletion : completion;
  const sidebarCompletionLabel =
    canUseDirection && view !== "docente"
      ? tFrame("review")
      : tRoutes("teacher");
  const setTeacherCoursePending = (teacherId: string, pending: boolean) => {
    setCourseSavingIds((current) => {
      if (pending) {
        return current.includes(teacherId) ? current : [...current, teacherId];
      }
      return current.filter((item) => item !== teacherId);
    });
  };
  const nextTeacherCourseMutation = (teacherId: string) => {
    const next = (teacherCourseMutationRef.current.get(teacherId) ?? 0) + 1;
    teacherCourseMutationRef.current.set(teacherId, next);
    return next;
  };
  const isLatestTeacherCourseMutation = (
    teacherId: string,
    mutationId: number,
  ) => teacherCourseMutationRef.current.get(teacherId) === mutationId;
  const withUpdatedTeacher = (
    payload: SchedulePayload,
    teacherId: string,
    updater: (teacher: TeacherProfile) => TeacherProfile,
  ) => {
    const teachers = payload.teachers.map((teacher) =>
      teacher.id === teacherId ? updater(teacher) : teacher,
    );
    const nextProfile =
      payload.profile.id === teacherId
        ? updater(payload.profile)
        : payload.profile;
    return {
      ...payload,
      profile: nextProfile,
      teachers,
    };
  };
  const updateTeacherInData = (
    teacherId: string,
    updater: (teacher: TeacherProfile) => TeacherProfile,
  ) => {
    updateData((current) => withUpdatedTeacher(current, teacherId, updater));
  };

  const handleToggleSlot = (day: DayKey, hour: number) => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    const key = slotKey(day, hour);
    const previous = data;
    let availability: string[] | null = null;
    updateTeacherInData(profile.id, (teacher) => {
      const next = new Set(teacher.availability);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      availability = Array.from(next).sort();
      return { ...teacher, availability, status: "borrador" };
    });
    if (!availability) {
      return;
    }
    const nextAvailability = availability;
    const mutationId = availabilityMutationRef.current + 1;
    availabilityMutationRef.current = mutationId;
    setAvailabilitySaving(true);
    request(
      { action: "setAvailability", availability: nextAvailability },
      { commitPayload: false, showSaving: false },
    ).then((payload) => {
      if (availabilityMutationRef.current !== mutationId) {
        return;
      }
      setAvailabilitySaving(false);
      if (payload) {
        writeData(
          withUpdatedTeacher(payload, profile.id, (teacher) => ({
            ...teacher,
            availability: nextAvailability,
            status: "borrador",
          })),
        );
      } else if (previous) {
        writeData(previous);
      }
    });
  };

  const handleContractChange = (contract: ContractKey) => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    const previous = data;
    updateTeacherInData(profile.id, (teacher) => ({
      ...teacher,
      contract,
      status: "borrador",
    }));
    setProfileSaving(true);
    request(
      { action: "setContract", contract },
      { commitPayload: false, showSaving: false },
    ).then((payload) => {
      setProfileSaving(false);
      if (payload) {
        writeData(payload);
      } else if (previous) {
        writeData(previous);
      }
    });
  };

  const handleAddCourse = async () => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    const course = catalogForSchool.find((item) => item.id === courseId);
    if (!course) {
      return;
    }
    if (profile.courses.some((item) => item.id === course.id)) {
      toast.info(t("courseAlreadySelected"));
      return;
    }
    if (
      !course.isThesis &&
      validation.countedCourses >= contractRules[profile.contract].maxCourses
    ) {
      toast.error(t("maxCoursesReached"));
      return;
    }
    const previous = data;
    const mutationId = nextTeacherCourseMutation(profile.id);
    setTeacherCoursePending(profile.id, true);
    updateTeacherInData(profile.id, (teacher) => ({
      ...teacher,
      courses: teacher.courses.some((item) => item.id === course.id)
        ? teacher.courses
        : [...teacher.courses, course],
      status: "borrador",
    }));
    const payload = await request(
      { action: "addCourse", courseId: course.id },
      { commitPayload: false, showSaving: false },
    );
    if (isLatestTeacherCourseMutation(profile.id, mutationId)) {
      setTeacherCoursePending(profile.id, false);
      if (payload) {
        writeData(
          withUpdatedTeacher(payload, profile.id, (teacher) => ({
            ...teacher,
            courses: teacher.courses.some((item) => item.id === course.id)
              ? teacher.courses
              : [...teacher.courses, course],
            status: "borrador",
          })),
        );
        toast.success(t("courseAdded"));
      } else if (previous) {
        writeData(previous);
      }
    }
  };

  const handleRemoveCourse = async (id: string) => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    const previous = data;
    const mutationId = nextTeacherCourseMutation(profile.id);
    setTeacherCoursePending(profile.id, true);
    updateTeacherInData(profile.id, (teacher) => ({
      ...teacher,
      courses: teacher.courses.filter((course) => course.id !== id),
      status: "borrador",
    }));
    const payload = await request(
      { action: "removeCourse", courseId: id },
      { commitPayload: false, showSaving: false },
    );
    if (isLatestTeacherCourseMutation(profile.id, mutationId)) {
      setTeacherCoursePending(profile.id, false);
      if (payload) {
        writeData(
          withUpdatedTeacher(payload, profile.id, (teacher) => ({
            ...teacher,
            courses: teacher.courses.filter((course) => course.id !== id),
            status: "borrador",
          })),
        );
        toast.success(t("courseRemoved"));
      } else if (previous) {
        writeData(previous);
      }
    }
  };

  const handleSubmit = async () => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    if (!validation.complete) {
      toast.error(scheduleCorrectionMessage(profile, validation, tRules));
      return;
    }
    const payload = await request({ action: "submit" });
    if (payload) {
      toast.success(
        teacherMode === "sandbox" ? t("sandboxSubmitted") : t("submitted"),
      );
    }
  };

  const handleExportXlsx = async () => {
    await exportXlsx(
      selectedTeacher,
      selectedValidation,
      academicTerm,
      locale,
      tPrint,
      tMisc,
      tDays,
    );
    toast.success(t("excelGenerated"));
  };

  const handleExportPdf = async () => {
    await exportPdf(
      selectedTeacher,
      selectedValidation,
      academicTerm,
      locale,
      tPrint,
      tMisc,
      tDays,
    );
    toast.success(t("pdfGenerated"));
  };

  const handleExportAllPdf = async () => {
    if (!allTeachers.length) {
      toast.error(t("noTeachersToExport"));
      return;
    }
    await exportAllPdf(allTeachers, academicTerm, locale, tPrint, tMisc, tDays);
    toast.success(t("pagesReadyToPrint", { count: allTeachers.length }));
  };

  const handleSelectTeacher = (id: string) => {
    const teacher = allTeachers.find((item) => item.id === id);
    setSelectedTeacherId(id);
    setReviewNote(teacher?.reviewNote ?? "");
  };

  const handleObserveTeacher = async () => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    const note = reviewNote.trim();
    if (note.length < 8) {
      toast.error(t("observationTooShort"));
      return;
    }
    const payload = await request({
      action: "observe",
      teacherId: selectedTeacher.id,
      note,
    });
    if (payload) {
      toast.success(t("observationRecorded"));
      setReviewNote("");
    }
  };

  const handleApproveTeacher = async () => {
    if (periodClosed) {
      toast.error(t("periodAlreadyClosed"));
      return;
    }
    if (selectedTeacher.status !== "enviado") {
      toast.error(t("onlySubmittedCanBeApproved"));
      return;
    }
    if (!selectedValidation.complete) {
      toast.error(t("scheduleFailsRules"));
      return;
    }
    const payload = await request({
      action: "approve",
      teacherId: selectedTeacher.id,
    });
    if (payload) {
      toast.success(t("scheduleApproved"));
    }
  };

  const handleCreateCourse = async ({
    isThesis,
    name,
    school: nextSchool,
  }: {
    isThesis: boolean;
    name: string;
    school: string;
  }) => {
    const payload = await request({
      action: "createCourse",
      name,
      school: nextSchool,
      isThesis,
    });
    if (payload) {
      toast.success(t("courseSavedToCatalog"));
    }
    return payload;
  };

  const handleSetCourseActive = async (
    courseIdValue: string,
    active: boolean,
  ) => {
    const payload = await request({
      action: "setCourseActive",
      courseId: courseIdValue,
      active,
    });
    if (payload) {
      toast.success(active ? t("courseReactivated") : t("courseSuspended"));
    }
  };

  const handleSetAcademicTerm = async (academicTermValue: string) => {
    const payload = await request({
      action: "setAcademicTerm",
      academicTerm: academicTermValue,
    });
    if (payload) {
      toast.success(t("periodUpdated"));
    }
    return payload;
  };

  const handleSetPeriodClosed = async (closed: boolean) => {
    const payload = await request({
      action: "setPeriodClosed",
      closed,
    });
    if (payload) {
      toast.success(closed ? t("periodClosed") : t("periodReopened"));
    }
    return payload;
  };

  const handleSetUserAccess = async (
    userId: string,
    role: AppRole,
    schoolValue: string,
  ) => {
    const payload = await request({
      action: "setUserAccess",
      userId,
      role,
      school: schoolValue,
    });
    if (payload) {
      toast.success(t("accessUpdated"));
    }
    return payload;
  };

  const handleImportTeacherCourses = async ({
    apply,
    csv,
    replaceTeachers,
  }: {
    apply: boolean;
    csv: string;
    replaceTeachers: boolean;
  }) => {
    setSaving(true);
    try {
      if (useServerActions) {
        const result = await runTeacherCourseImport({
          apply,
          csv,
          replaceTeachers,
        });
        if (!result.ok) {
          toast.error(
            result.error.startsWith("toast.")
              ? t(toastKey(result.error) as never)
              : result.error,
          );
          return null;
        }
        writeData(result.result.payload);
        if (result.result.ok) {
          toast.success(
            result.result.applied
              ? t("teachingLoadApplied")
              : t("csvValidated"),
          );
        } else {
          toast.error(t("csvHasObservations"));
        }
        return result.result;
      }
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "importTeacherCourses",
          apply,
          csv,
          replaceTeachers,
        }),
      });
      if (!response.ok) {
        const apiError = await readApiError(response, t("csvImportFailed"));
        toast.error(
          apiError.startsWith("toast.")
            ? t(toastKey(apiError) as never)
            : apiError,
        );
        return null;
      }
      const result = (await response.json()) as TeacherCourseImportResponse;
      writeData(result.payload);
      if (result.ok) {
        toast.success(
          result.applied ? t("teachingLoadApplied") : t("csvValidated"),
        );
      } else {
        toast.error(t("csvHasObservations"));
      }
      return result;
    } catch {
      toast.error(t("connectFailed"));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleAssignTeacherCourse = async (
    teacherId: string,
    nextCourseId: string,
  ) => {
    const course = data.catalog.find((item) => item.id === nextCourseId);
    if (!course) {
      return null;
    }
    const previous = data;
    const mutationId = nextTeacherCourseMutation(teacherId);
    setTeacherCoursePending(teacherId, true);
    updateTeacherInData(teacherId, (teacher) => ({
      ...teacher,
      courses: teacher.courses.some((item) => item.id === course.id)
        ? teacher.courses
        : [...teacher.courses, course],
      status: "borrador",
    }));
    const payload = await request(
      {
        action: "assignTeacherCourse",
        teacherId,
        courseId: nextCourseId,
      },
      { commitPayload: false, showSaving: false },
    );
    if (isLatestTeacherCourseMutation(teacherId, mutationId)) {
      setTeacherCoursePending(teacherId, false);
      if (payload) {
        writeData(
          withUpdatedTeacher(payload, teacherId, (teacher) => ({
            ...teacher,
            courses: teacher.courses.some((item) => item.id === course.id)
              ? teacher.courses
              : [...teacher.courses, course],
            status: "borrador",
          })),
        );
        toast.success(t("courseAssignedToTeacher"));
      } else {
        writeData(previous);
      }
    }
    return payload;
  };

  const handleUnassignTeacherCourse = async (
    teacherId: string,
    nextCourseId: string,
  ) => {
    const previous = data;
    const mutationId = nextTeacherCourseMutation(teacherId);
    setTeacherCoursePending(teacherId, true);
    updateTeacherInData(teacherId, (teacher) => ({
      ...teacher,
      courses: teacher.courses.filter((course) => course.id !== nextCourseId),
      status: "borrador",
    }));
    const payload = await request(
      {
        action: "unassignTeacherCourse",
        teacherId,
        courseId: nextCourseId,
      },
      { commitPayload: false, showSaving: false },
    );
    if (isLatestTeacherCourseMutation(teacherId, mutationId)) {
      setTeacherCoursePending(teacherId, false);
      if (payload) {
        writeData(
          withUpdatedTeacher(payload, teacherId, (teacher) => ({
            ...teacher,
            courses: teacher.courses.filter(
              (course) => course.id !== nextCourseId,
            ),
            status: "borrador",
          })),
        );
        toast.success(t("courseRemovedFromTeacher"));
      } else {
        writeData(previous);
      }
    }
    return payload;
  };

  return (
    <ScheduleFrame
      academicTerm={academicTerm}
      canSignOut={showClerkControls}
      canUseAdmin={canUseAdmin}
      canUseDirection={canUseDirection}
      completion={sidebarCompletion}
      completionLabel={sidebarCompletionLabel}
      currentRole={data.onboarding.role}
      periodClosed={periodClosed}
      pendingCount={pendingCount}
      selectedView={view}
      status={profile.status}
      userName={data.userName}
    >
      {view === "configuracion" && canUseAdmin ? (
        <ConfigurationView
          academicTerm={academicTerm}
          approvedCount={approvedCount}
          catalog={data.catalog}
          canClosePeriod={
            data.teachers.length > 0 && approvedCount === data.teachers.length
          }
          onCreateCourse={handleCreateCourse}
          onImportTeacherCourses={handleImportTeacherCourses}
          onSetAcademicTerm={handleSetAcademicTerm}
          onSetCourseActive={handleSetCourseActive}
          onSetPeriodClosed={handleSetPeriodClosed}
          periodClosed={periodClosed}
          periodClosedAt={data.settings.periodClosedAt}
          saving={saving}
          schools={schoolOptions}
          teacherCount={data.teachers.length}
        />
      ) : view === "usuarios" && canUseAdmin ? (
        <UsersAccessView
          currentUserId={data.currentUserId}
          onSetUserAccess={handleSetUserAccess}
          saving={saving}
          departments={departmentOptions}
          users={data.users}
        />
      ) : view === "auditoria" && canUseAdmin ? (
        <AuditView events={data.events} />
      ) : view === "direccion" && canUseDirection ? (
        <DirectorView
          catalog={activeCatalog}
          courseSavingIds={courseSavingIds}
          exportTeacherCount={allTeachers.length}
          handleExportPdf={handleExportPdf}
          handleExportAllPdf={handleExportAllPdf}
          handleExportXlsx={handleExportXlsx}
          handleApproveTeacher={handleApproveTeacher}
          handleAssignTeacherCourse={handleAssignTeacherCourse}
          handleObserveTeacher={handleObserveTeacher}
          handleUnassignTeacherCourse={handleUnassignTeacherCourse}
          events={selectedEvents}
          periodClosed={periodClosed}
          reviewNote={reviewNote}
          selectedTeacher={selectedTeacher}
          selectedTeacherId={selectedTeacher.id}
          setReviewNote={setReviewNote}
          setSelectedTeacherId={handleSelectTeacher}
          setShowOnlyPending={setShowOnlyPending}
          setTeacherQuery={setTeacherQuery}
          setTeacherStatusFilter={setTeacherStatusFilter}
          showOnlyPending={showOnlyPending}
          saving={saving}
          selectedTeacherVisible={selectedTeacherVisible}
          schools={schoolOptions}
          teacherQuery={teacherQuery}
          teacherStatusFilter={teacherStatusFilter}
          teachers={filteredTeachers}
          reviewCounts={reviewCounts}
          totalTeacherCount={allTeachers.length}
          validation={selectedValidation}
        />
      ) : view === "direccion" ||
        view === "configuracion" ||
        view === "usuarios" ||
        view === "auditoria" ? (
        <LockedDirectionView />
      ) : (
        <DocenteView
          academicTerm={academicTerm}
          catalogForSchool={catalogForSchool}
          courseId={courseId}
          courseSaving={courseSavingIds.includes(profile.id)}
          handleAddCourse={handleAddCourse}
          handleContractChange={handleContractChange}
          handleRemoveCourse={handleRemoveCourse}
          handleSubmit={handleSubmit}
          handleToggleSlot={handleToggleSlot}
          periodClosed={periodClosed}
          profile={profile}
          saving={saving}
          school={school}
          schools={schoolOptions}
          setCourseId={setCourseId}
          setSchool={setSchool}
          statusSaving={availabilitySaving || profileSaving}
          teacherMode={teacherMode}
          validation={validation}
        />
      )}
    </ScheduleFrame>
  );
}

export function OnboardingRouteApp({
  initialData,
  preview = false,
}: {
  initialData?: SchedulePayload;
  preview?: boolean;
}) {
  const router = useRouter();
  const _locale = useLocale();
  const t = useTranslations("toast");
  const [data, setData] = useState<SchedulePayload | null>(
    () => initialData ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const endpoint = preview ? "/api/schedule?preview=1" : "/api/schedule";
  const useServerActions = Boolean(initialData) && !preview;

  useEffect(() => {
    if (initialData) {
      return;
    }
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(t("profileLoadFailed"));
        }
        setData((await response.json()) as SchedulePayload);
      })
      .catch((caught) => setError(caught.message));
  }, [endpoint, initialData, t]);

  const handleComplete = async (next: Onboarding) => {
    if (useServerActions) {
      const result = await completeOnboardingMutation({
        role: next.role,
        school: next.school,
        code: next.code,
      });
      if (!result.ok) {
        const errKey = result.error ?? "";
        toast.error(
          errKey.startsWith("toast.")
            ? t(toastKey(errKey) as never)
            : errKey || t("profileSaveFailed"),
        );
        return;
      }
      router.push(result.payload.canUseDirection ? "/direction" : "/teacher");
      return;
    }
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "completeOnboarding",
        role: next.role,
        school: next.school,
        code: next.code,
      }),
    });
    if (!response.ok) {
      toast.error(await readApiError(response, t("profileSaveFailed")));
      return;
    }
    router.push("/teacher");
  };

  if (error) {
    return <AppError error={error} onRetry={() => router.refresh()} />;
  }

  if (!data) {
    return <AppLoading />;
  }

  return (
    <OnboardingView
      defaultSchool={data.onboarding.school || departments[0]}
      onComplete={handleComplete}
      schoolOptions={data.departments.length ? data.departments : departments}
      userEmail={data.profile.email}
    />
  );
}

function ScheduleFrame({
  academicTerm,
  canSignOut,
  canUseAdmin,
  canUseDirection,
  children,
  completion,
  completionLabel,
  currentRole,
  pendingCount,
  periodClosed,
  selectedView,
  status,
  userName,
}: {
  academicTerm: string;
  canSignOut: boolean;
  canUseAdmin: boolean;
  canUseDirection: boolean;
  children: React.ReactNode;
  completion: number;
  completionLabel: string;
  currentRole: AppRole;
  pendingCount: number;
  periodClosed: boolean;
  selectedView: ViewKey;
  status: TeacherProfile["status"];
  userName: string;
}) {
  const t = useTranslations("scheduleFrame");
  const tStatus = useTranslations("status");
  const tRoutes = useTranslations("routes");
  const tMisc = useTranslations("misc");
  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar collapsible="icon" className="border-sidebar-border">
          <AppSidebar
            canSignOut={canSignOut}
            canUseAdmin={canUseAdmin}
            canUseDirection={canUseDirection}
            completion={completion}
            completionLabel={completionLabel}
            currentRole={currentRole}
            pendingCount={pendingCount}
            selectedView={selectedView}
            userName={userName}
          />
          <SidebarRail />
        </Sidebar>
        <SidebarInset className="h-screen min-h-0 overflow-hidden">
          <header className="flex h-14 shrink-0 items-center justify-between border-b bg-card px-3 md:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <SidebarTrigger />
              <Separator orientation="vertical" className="h-6" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-muted-foreground text-xs">
                  <span>{t("academicTerm", { term: academicTerm })}</span>
                  <ChevronRight className="size-3" />
                  <span className="truncate">
                    {routeLabel(selectedView, tRoutes)}
                  </span>
                </div>
                <h1 className="truncate font-serif text-lg font-semibold md:text-xl">
                  {t("title")}
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant={
                  periodClosed || status === "aprobado"
                    ? "default"
                    : "secondary"
                }
                className="hidden sm:inline-flex"
              >
                {periodClosed
                  ? t("periodClosed")
                  : statusLabel(status, tStatus)}
              </Badge>
              <Badge variant="outline" className="hidden md:inline-flex">
                {roleLabel(currentRole, tMisc)}
              </Badge>
              <ThemeToggle />
              {canSignOut ? <UserButton /> : null}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
            {children}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function AppSidebar({
  canSignOut,
  canUseAdmin,
  canUseDirection,
  completion,
  completionLabel,
  currentRole,
  pendingCount,
  selectedView,
  userName,
}: {
  canSignOut: boolean;
  canUseAdmin: boolean;
  canUseDirection: boolean;
  completion: number;
  completionLabel: string;
  currentRole: AppRole;
  pendingCount: number;
  selectedView: ViewKey;
  userName: string;
}) {
  const _locale = useLocale();
  const tCommon = useTranslations("common");
  const tRoutes = useTranslations("routes");
  const tSidebar = useTranslations("sidebar");
  const tMisc = useTranslations("misc");
  return (
    <>
      <SidebarHeader className="h-14 border-sidebar-border border-b p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
        <div className="flex h-10 w-full items-center gap-3 rounded-lg px-1 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border group-data-[collapsible=icon]:border-sidebar-border group-data-[collapsible=icon]:bg-sidebar-accent group-data-[collapsible=icon]:px-0">
          <Image
            src="/escudo-unmsm.png"
            alt={tMisc("escudoAlt")}
            width={40}
            height={40}
            className="rounded-md bg-vellum p-1 group-data-[collapsible=icon]:hidden"
            priority
          />
          <GraduationCap className="hidden size-4 text-gold group-data-[collapsible=icon]:block" />
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-gold text-[11px] font-semibold uppercase tracking-[0.18em]">
              UNMSM
            </p>
            <p className="truncate font-serif font-semibold text-lg">
              {tSidebar("brand")}
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{tCommon("language")}</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <LanguageSwitcher />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{tSidebar("session")}</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2 px-2">
            <p className="truncate font-medium text-sidebar-foreground">
              {userName}
            </p>
            <p className="text-sidebar-foreground/70 text-xs">
              {roleLabel(currentRole, tMisc)}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <SidebarGroupLabel>{tSidebar("work")}</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                isActive={selectedView === "docente"}
                render={<Link href="/teacher" />}
                tooltip={tRoutes("teacher")}
              >
                <CalendarClock />
                <span>{tRoutes("teacher")}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {canUseDirection ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                  isActive={selectedView === "direccion"}
                  render={<Link href="/direction" />}
                  tooltip={tRoutes("direction")}
                >
                  <Users />
                  <span>{tRoutes("direction")}</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
              </SidebarMenuItem>
            ) : null}
            {canUseAdmin ? (
              <>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                    isActive={selectedView === "usuarios"}
                    render={<Link href="/direction/users" />}
                    tooltip={tRoutes("users")}
                  >
                    <UserCog />
                    <span>{tRoutes("users")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                    isActive={selectedView === "auditoria"}
                    render={<Link href="/direction/audit" />}
                    tooltip={tRoutes("audit")}
                  >
                    <History />
                    <span>{tRoutes("audit")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                    isActive={selectedView === "configuracion"}
                    render={<Link href="/direction/settings" />}
                    tooltip={tRoutes("settings")}
                  >
                    <Settings2 />
                    <span>{tRoutes("settings")}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{tSidebar("progress")}</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3 px-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-sidebar-foreground/70">
                {completionLabel}
              </span>
              <span className="text-gold font-medium">{completion}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sidebar-accent">
              <div
                className="h-full bg-gold"
                style={{ width: `${completion}%` }}
              />
            </div>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      {canSignOut ? (
        <SidebarFooter className="border-sidebar-border border-t p-3">
          <SignOutButton>
            <Button
              variant="outline"
              className="w-full border-sidebar-border bg-transparent text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:px-0"
            >
              <span className="group-data-[collapsible=icon]:hidden">
                {tSidebar("signOut")}
              </span>
              <Home className="hidden group-data-[collapsible=icon]:block" />
            </Button>
          </SignOutButton>
        </SidebarFooter>
      ) : null}
    </>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
  const t = useTranslations("sidebar");
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      aria-label={t("changeTheme")}
    >
      <Sun className="hidden size-4 dark:block" />
      <Moon className="size-4 dark:hidden" />
    </Button>
  );
}

function AppLoading() {
  return (
    <main className="grid h-screen overflow-hidden bg-background text-foreground lg:grid-cols-[256px_minmax(0,1fr)]">
      <aside className="hidden min-h-0 border-sidebar-border border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 border-sidebar-border border-b px-3">
          <Skeleton className="size-10 rounded-md bg-sidebar-accent" />
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3 w-20 bg-sidebar-accent" />
            <Skeleton className="h-5 w-32 bg-sidebar-accent" />
          </div>
        </div>
        <div className="space-y-6 p-3">
          <div className="space-y-2">
            <Skeleton className="h-3 w-14 bg-sidebar-accent" />
            <Skeleton className="h-5 w-24 bg-sidebar-accent" />
            <Skeleton className="h-4 w-16 bg-sidebar-accent" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-16 bg-sidebar-accent" />
            <Skeleton className="h-10 w-full bg-sidebar-accent" />
            <Skeleton className="h-10 w-full bg-sidebar-accent" />
            <Skeleton className="h-10 w-full bg-sidebar-accent" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-3 w-20 bg-sidebar-accent" />
            <Skeleton className="h-2 w-full rounded-full bg-sidebar-accent" />
          </div>
        </div>
      </aside>
      <section className="grid min-h-0 grid-rows-[64px_minmax(0,1fr)]">
        <header className="flex items-center justify-between border-b bg-card px-3 md:px-5">
          <div className="min-w-0 space-y-2">
            <Skeleton className="h-3 w-52" />
            <Skeleton className="h-7 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-24 rounded-full" />
            <Skeleton className="size-8 rounded-full" />
          </div>
        </header>
        <div className="grid min-h-0 gap-3 p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
          <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b p-3">
              <div className="space-y-2">
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-4 w-72" />
              </div>
              <Skeleton className="h-9 w-36" />
            </div>
            <div className="grid min-h-0 grid-cols-[92px_repeat(6,minmax(0,1fr))] grid-rows-[44px_repeat(14,minmax(0,1fr))]">
              {loadingScheduleCells.map((key) => (
                <div className="border-border border-r border-b p-2" key={key}>
                  <Skeleton className="h-full w-full rounded-sm" />
                </div>
              ))}
            </div>
          </section>
          <aside className="hidden min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3 xl:grid">
            <section className="overflow-hidden rounded-lg border bg-card">
              <div className="space-y-2 border-b p-3">
                <Skeleton className="h-6 w-44" />
                <Skeleton className="h-4 w-56" />
              </div>
              <div className="space-y-2 p-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </section>
            <section className="rounded-lg border bg-card p-3">
              <div className="mb-3 flex items-center justify-between">
                <Skeleton className="h-6 w-36" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function AppError({ error, onRetry }: { error: string; onRetry: () => void }) {
  const t = useTranslations("sidebar");
  const tCommon = useTranslations("common");
  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <Alert variant="error" className="max-w-lg">
        <AlertCircle />
        <AlertTitle>{t("cannotOpen")}</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <AlertAction>
          <Button onClick={onRetry}>{tCommon("retry")}</Button>
        </AlertAction>
      </Alert>
    </main>
  );
}

function OnboardingView({
  defaultSchool,
  onComplete,
  schoolOptions,
  userEmail,
}: {
  defaultSchool: string;
  onComplete: (next: Onboarding) => Promise<void>;
  schoolOptions: string[];
  userEmail?: string;
}) {
  const role: AppRole = "docente";
  const [school, setSchool] = useState(defaultSchool);
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);
  const codeIsValid = code.trim().length >= 4;
  const t = useTranslations("onboarding");
  const tToast = useTranslations("toast");
  const tMisc = useTranslations("misc");

  const handleSubmit = async () => {
    if (!codeIsValid) {
      toast.error(tToast("invalidCode"));
      return;
    }
    setSaving(true);
    await onComplete({
      role,
      school,
      code: code.trim(),
      complete: true,
    });
    setSaving(false);
  };

  return (
    <section className="flex h-screen min-h-0 items-center justify-center overflow-hidden bg-background p-3 text-foreground md:p-6">
      <div className="grid h-full max-h-[620px] w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-sm lg:grid-cols-[minmax(0,1fr)_370px]">
        <div className="hidden min-h-0 flex-col justify-between bg-sidebar p-6 text-sidebar-foreground lg:flex">
          <div className="flex items-center gap-3">
            <Image
              src="/escudo-unmsm.png"
              alt={tMisc("escudoAlt")}
              width={52}
              height={52}
              className="rounded-md bg-vellum p-1"
              priority
            />
            <div className="min-w-0">
              <p className="text-gold text-xs font-semibold uppercase tracking-[0.18em]">
                UNMSM
              </p>
              <p className="truncate font-serif text-2xl font-semibold">
                {t("title")}
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="font-serif text-3xl leading-tight">{t("subtitle")}</p>
            <p className="text-sidebar-foreground/75 text-sm leading-6">
              {t("verifyDescription")}
            </p>
          </div>
          <div className="grid gap-2 text-sm">
            {[t("weeklyAvailability"), t("termCourses"), t("submission")].map(
              (item) => (
                <div className="flex items-center gap-2" key={item}>
                  <Check className="size-4 text-gold" />
                  <span>{item}</span>
                </div>
              ),
            )}
          </div>
        </div>
        <Card className="min-h-0 overflow-hidden border-0 shadow-none">
          <CardHeader className="border-b p-4">
            <Badge variant="secondary" className="w-fit">
              {t("firstAccess")}
            </Badge>
            <CardTitle className="font-serif text-2xl">
              {t("confirmData")}
            </CardTitle>
            <CardDescription>{t("dataAssociation")}</CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 p-4">
            <div className="space-y-3">
              <Alert variant="info" className="rounded-md p-2.5">
                <Info />
                <AlertTitle>{t("detectedAccount")}</AlertTitle>
                <AlertDescription>
                  {userEmail ?? t("pendingEmail")}
                </AlertDescription>
              </Alert>
              <Field className="rounded-md border bg-muted/25 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <CalendarClock className="size-4 text-gold" />
                  {t("roleLabel")}
                </div>
                <FieldDescription>{t("roleDescription")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{t("department")}</FieldLabel>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t("selectDepartment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{t("departments")}</SelectLabel>
                      {schoolOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t("facultyCode")}</FieldLabel>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder={t("codePlaceholder")}
                  type="text"
                />
                <FieldDescription>{t("codeHint")}</FieldDescription>
              </Field>
              <Button
                className="w-full"
                disabled={!codeIsValid}
                loading={saving}
                onClick={handleSubmit}
              >
                <Save data-icon="inline-start" />
                {t("saveProfile")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function DocenteView({
  academicTerm,
  catalogForSchool,
  courseId,
  courseSaving,
  handleAddCourse,
  handleContractChange,
  handleRemoveCourse,
  handleSubmit,
  handleToggleSlot,
  periodClosed,
  profile,
  saving,
  school,
  schools,
  setCourseId,
  setSchool,
  statusSaving,
  teacherMode,
  validation,
}: {
  academicTerm: string;
  catalogForSchool: Course[];
  courseId: string;
  courseSaving: boolean;
  handleAddCourse: () => void;
  handleContractChange: (contract: ContractKey) => void;
  handleRemoveCourse: (id: string) => void;
  handleSubmit: () => void;
  handleToggleSlot: (day: DayKey, hour: number) => void;
  periodClosed: boolean;
  profile: TeacherProfile;
  saving: boolean;
  school: string;
  schools: string[];
  setCourseId: (id: string) => void;
  setSchool: (school: string) => void;
  statusSaving: boolean;
  teacherMode: SchedulePayload["teacherMode"];
  validation: Validation;
}) {
  const selectedCourse = catalogForSchool.find(
    (course) => course.id === courseId,
  );
  const selectedCourseAlreadyAdded = selectedCourse
    ? profile.courses.some((course) => course.id === selectedCourse.id)
    : false;
  const selectedCourseLimitReached = Boolean(
    selectedCourse &&
      !selectedCourse.isThesis &&
      validation.countedCourses >= contractRules[profile.contract].maxCourses,
  );
  const addCourseDisabled =
    periodClosed ||
    !selectedCourse ||
    selectedCourseAlreadyAdded ||
    selectedCourseLimitReached;
  const t = useTranslations("teacher");
  const tContracts = useTranslations("contracts");
  const tScheduleBoard = useTranslations("scheduleBoard");
  const tCommon = useTranslations("common");
  const addCourseLabel = periodClosed
    ? tScheduleBoard("closed")
    : selectedCourseAlreadyAdded
      ? tScheduleBoard("added")
      : selectedCourseLimitReached
        ? tScheduleBoard("quotaFull")
        : tScheduleBoard("add");
  const creditTotal = profile.courses.reduce(
    (total, course) => total + (course.credits ?? 0),
    0,
  );
  const hasKnownCredits = profile.courses.some((course) => course.credits);
  const sandboxMode = teacherMode === "sandbox";

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-y-auto overflow-x-hidden p-3 xl:grid-cols-[minmax(0,1fr)_330px] xl:overflow-hidden">
      <Card className="min-h-[700px] overflow-hidden xl:min-h-0">
        <CardHeader className="grid shrink-0 gap-2 border-b px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <CardTitle className="truncate font-serif text-lg md:text-xl">
                {t("availability")}
              </CardTitle>
              <Badge variant="secondary">{academicTerm}</Badge>
              {sandboxMode ? (
                <Badge
                  variant="outline"
                  className="border-warning text-warning"
                >
                  {t("testMode")}
                </Badge>
              ) : null}
            </div>
          </div>
          <Toolbar className="shrink-0 border-0 bg-transparent p-0 shadow-none">
            <ToolbarGroup>
              {statusSaving ? (
                <Badge variant="secondary" className="hidden md:inline-flex">
                  {tCommon("saving")}
                </Badge>
              ) : null}
              <Select
                disabled={periodClosed}
                value={profile.contract}
                onValueChange={handleContractChange}
              >
                <SelectTrigger className="w-[190px] max-w-[calc(100vw-160px)]">
                  <span className="truncate">
                    {tContracts(
                      profile.contract === "full"
                        ? "fullTime"
                        : profile.contract === "partial20"
                          ? "partTime20"
                          : "partTime10",
                    )}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("teachingCategory")}</SelectLabel>
                    {Object.keys(contractRules).map((key) => (
                      <SelectItem key={key} value={key}>
                        {tContracts(
                          key === "full"
                            ? "fullTime"
                            : key === "partial20"
                              ? "partTime20"
                              : "partTime10",
                        )}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ToolbarSeparator orientation="vertical" />
              <ToolbarButton
                disabled={saving || periodClosed || !validation.complete}
                onClick={handleSubmit}
                render={<Button />}
              >
                <Send data-icon="inline-start" />
                {t("submit")}
              </ToolbarButton>
            </ToolbarGroup>
          </Toolbar>
        </CardHeader>
        <DocenteRuleStrip profile={profile} validation={validation} />
        <CardContent className="min-h-0 flex-1 p-0">
          <ScheduleBoard
            availability={profile.availability}
            interactive={!periodClosed}
            onToggleSlot={handleToggleSlot}
          />
        </CardContent>
      </Card>
      <aside className="grid min-h-0 content-start gap-3 overflow-visible xl:overflow-hidden">
        {sandboxMode ? (
          <Alert className="rounded-md p-2" variant="warning">
            <Info />
            <AlertTitle>{t("sandbox")}</AlertTitle>
            <AlertDescription className="text-xs">
              {t("sandboxDescription")}
            </AlertDescription>
          </Alert>
        ) : null}
        <CoursesEditorCard
          catalogForSchool={catalogForSchool}
          addCourseDisabled={addCourseDisabled}
          addCourseLabel={addCourseLabel}
          courseId={courseId}
          creditProgress={hasKnownCredits ? `${creditTotal} cr.` : undefined}
          courseProgress={`${validation.countedCourses}/${contractRules[profile.contract].maxCourses}`}
          courseSaving={courseSaving}
          courses={profile.courses}
          disabled={periodClosed}
          handleAddCourse={handleAddCourse}
          handleRemoveCourse={handleRemoveCourse}
          school={school}
          schools={schools}
          setCourseId={setCourseId}
          setSchool={setSchool}
        />
        <TeacherStatusPanel
          onSubmit={handleSubmit}
          periodClosed={periodClosed}
          profile={profile}
          saving={saving}
          validation={validation}
        />
      </aside>
    </section>
  );
}

function DocenteRuleStrip({
  profile,
  validation,
}: {
  profile: TeacherProfile;
  validation: Validation;
}) {
  const _locale = useLocale();
  const t = useTranslations("teacher");
  const tRules = useTranslations("ruleMessages");
  const rule = contractRules[profile.contract];
  const blockLabel =
    rule.requiredDailyBlockCount > 1
      ? tRules("blockPlural", { count: rule.requiredDailyBlockCount })
      : tRules("blockSingular");
  const courseLabel =
    rule.maxCourses === 1 ? tRules("courseSingular") : tRules("coursePlural");
  const ruleSummary = tRules("ruleSummary", {
    hours: rule.requiredDailyHours,
    blocks: blockLabel,
    days: rule.requiredBlockDays,
    maxCourses: rule.maxCourses,
    courseLabel,
  });
  const items = [
    {
      complete: validation.selectedHours >= rule.requiredHours,
      label: t("hours"),
      value: `${validation.selectedHours}/${rule.requiredHours}`,
    },
    {
      complete: validation.blockDays >= rule.requiredBlockDays,
      label: t("validDays"),
      value: `${validation.blockDays}/${rule.requiredBlockDays}`,
    },
    {
      complete:
        validation.countedCourses > 0 &&
        validation.countedCourses <= rule.maxCourses,
      label: t("courses"),
      value: `${validation.countedCourses}/${rule.maxCourses}`,
    },
  ];

  return (
    <div className="grid shrink-0 gap-1.5 border-b bg-muted/20 px-3 py-1.5 text-sm lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-0.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1.5 font-medium">
            <Info className="size-4 text-gold" />
            {t("rules")}
          </span>
          <span className="text-muted-foreground text-xs md:text-sm">
            {ruleSummary}
          </span>
        </div>
        {!validation.complete ? (
          <p className="truncate text-warning text-xs md:text-sm">
            {scheduleCorrectionMessage(profile, validation, tRules)}
          </p>
        ) : null}
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-1.5">
        {items.map((item) => (
          <div
            className="rounded-md border bg-card px-2 py-1 leading-tight"
            key={item.label}
          >
            <div className="truncate text-muted-foreground text-xs">
              {item.label}
            </div>
            <div
              className={cn(
                "font-semibold text-sm tabular-nums",
                item.complete ? "text-availability" : "text-foreground",
              )}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoursesEditorCard({
  addCourseDisabled,
  addCourseLabel,
  catalogForSchool,
  courseId,
  creditProgress,
  courseProgress,
  courseSaving,
  courses,
  disabled = false,
  handleAddCourse,
  handleRemoveCourse,
  school,
  schools,
  setCourseId,
  setSchool,
}: {
  addCourseDisabled: boolean;
  addCourseLabel: string;
  catalogForSchool: Course[];
  courseId: string;
  creditProgress?: string;
  courseProgress: string;
  courseSaving: boolean;
  courses: Course[];
  disabled?: boolean;
  handleAddCourse: () => void;
  handleRemoveCourse: (id: string) => void;
  school: string;
  schools: string[];
  setCourseId: (id: string) => void;
  setSchool: (school: string) => void;
}) {
  const selectedCourse = catalogForSchool.find(
    (course) => course.id === courseId,
  );

  const tTeacher = useTranslations("teacher");
  const tCatalog = useTranslations("catalog");

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="shrink-0 border-b px-2.5 py-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              {tTeacher("selectedCourses")}
            </CardTitle>
            <CardDescription className="hidden truncate sm:block">
              {tTeacher("loadAllowedByContract")}
            </CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="secondary">{courseProgress}</Badge>
            {creditProgress ? (
              <Badge variant="outline">{creditProgress}</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-1.5 px-2 py-1.5">
        <div className="grid gap-1.5">
          <Select disabled={disabled} value={school} onValueChange={setSchool}>
            <SelectTrigger className="w-full" size="sm">
              <span className="truncate">{school}</span>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{tCatalog("professionalSchool")}</SelectLabel>
                {schools.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Select
              disabled={disabled}
              value={courseId}
              onValueChange={setCourseId}
            >
              <SelectTrigger className="w-full" size="sm">
                <span className="truncate">
                  {selectedCourse
                    ? courseLabel(selectedCourse)
                    : tCatalog("course")}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tCatalog("course")}</SelectLabel>
                  {catalogForSchool.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {courseLabel(course)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              disabled={addCourseDisabled}
              loading={courseSaving}
              onClick={handleAddCourse}
              size="sm"
            >
              <Plus data-icon="inline-start" />
              {addCourseLabel}
            </Button>
          </div>
        </div>
        <div className="h-[clamp(150px,30vh,260px)] min-h-0 overflow-hidden rounded-md border bg-muted/20">
          <CourseCardsList
            courses={courses}
            emptyDescription={tTeacher("addCoursesDescription")}
            onRemoveCourse={disabled ? undefined : handleRemoveCourse}
            removeDisabled={courseSaving}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ConfigurationView({
  academicTerm,
  approvedCount,
  canClosePeriod,
  catalog,
  onCreateCourse,
  onImportTeacherCourses,
  onSetAcademicTerm,
  onSetCourseActive,
  onSetPeriodClosed,
  periodClosed,
  periodClosedAt,
  saving,
  schools: schoolOptions,
  teacherCount,
}: {
  academicTerm: string;
  approvedCount: number;
  canClosePeriod: boolean;
  catalog: Course[];
  onCreateCourse: (input: {
    isThesis: boolean;
    name: string;
    school: string;
  }) => Promise<SchedulePayload | null>;
  onImportTeacherCourses: (input: {
    apply: boolean;
    csv: string;
    replaceTeachers: boolean;
  }) => Promise<TeacherCourseImportResponse | null>;
  onSetAcademicTerm: (academicTerm: string) => Promise<SchedulePayload | null>;
  onSetCourseActive: (courseId: string, active: boolean) => Promise<void>;
  onSetPeriodClosed: (closed: boolean) => Promise<SchedulePayload | null>;
  periodClosed: boolean;
  periodClosedAt?: string;
  saving: boolean;
  schools: string[];
  teacherCount: number;
}) {
  const tDir = useTranslations("direction");
  const tCat = useTranslations("catalog");
  const tToast = useTranslations("toast");
  const _tTeacher = useTranslations("teacher");
  const tMisc = useTranslations("misc");
  const _tStatus = useTranslations("status");
  const tContracts = useTranslations("contracts");
  const [term, setTerm] = useState(academicTerm);
  const [name, setName] = useState("");
  const [school, setSchool] = useState(schoolOptions[0] ?? "");
  const [customSchool, setCustomSchool] = useState("");
  const [isThesis, setIsThesis] = useState(false);
  const [catalogQuery, setCatalogQuery] = useState("");
  const [catalogStatusFilter, setCatalogStatusFilter] =
    useState<CourseStatusFilter>("all");
  const [catalogSchoolFilter, setCatalogSchoolFilter] = useState("all");
  const [teacherCourseImportCsv, setTeacherCourseImportCsv] = useState("");
  const [teacherCourseImportFile, setTeacherCourseImportFile] = useState("");
  const [replaceTeacherCourses, setReplaceTeacherCourses] = useState(true);
  const [teacherCourseImportResult, setTeacherCourseImportResult] =
    useState<TeacherCourseImportResponse | null>(null);
  const selectedSchool = customSchool.trim() || school;
  const activeCount = catalog.filter(
    (course) => course.active !== false,
  ).length;
  const inactiveCount = catalog.length - activeCount;
  const catalogSchools = Array.from(
    new Set(catalog.map((course) => course.school)),
  ).sort((a, b) => a.localeCompare(b));
  const filteredCatalog = filterCourses(catalog, {
    query: catalogQuery,
    schoolFilter: catalogSchoolFilter,
    statusFilter: catalogStatusFilter,
    tCatalog: tCat,
  });
  const catalogFiltersActive =
    catalogQuery.trim().length > 0 ||
    catalogStatusFilter !== "all" ||
    catalogSchoolFilter !== "all";
  const formatImportError = (item: string) => {
    const facultyMatch = item.match(/^Fila (\d+): docente no encontrado\.$/);
    if (facultyMatch) {
      return tToast("csvRowFacultyNotFound", { row: facultyMatch[1] });
    }
    const missingCodeMatch = item.match(
      /^Fila (\d+): curso sin código o id\.$/,
    );
    if (missingCodeMatch) {
      return tToast("csvRowMissingCode", { row: missingCodeMatch[1] });
    }
    const ambiguousMatch = item.match(
      /^Fila (\d+): código de curso ambiguo, agrega escuela o course_id\.$/,
    );
    if (ambiguousMatch) {
      return tToast("csvRowAmbiguousCourse", { row: ambiguousMatch[1] });
    }
    const courseMatch = item.match(/^Fila (\d+): curso no encontrado\.$/);
    if (courseMatch) {
      return tToast("csvRowCourseNotFound", { row: courseMatch[1] });
    }
    const quotaMatch = item.match(
      /^(.+): ([0-9]+\/[0-9]+) cursos no Tesis para (.+)\.$/,
    );
    if (quotaMatch) {
      const category =
        Object.values(contractRules).find(
          (rule) => rule.fallbackLabel === quotaMatch[3],
        )?.label ?? quotaMatch[3];
      return tToast("quotaMessage", {
        name: quotaMatch[1],
        quota: quotaMatch[2],
        category: category.startsWith("contracts.")
          ? tContracts(category.slice("contracts.".length))
          : category,
      });
    }
    return item.startsWith("toast.") ? tToast(toastKey(item) as never) : item;
  };
  const clearCatalogFilters = () => {
    setCatalogQuery("");
    setCatalogStatusFilter("all");
    setCatalogSchoolFilter("all");
  };

  useEffect(() => {
    if (!school && schoolOptions[0]) {
      setSchool(schoolOptions[0]);
    }
  }, [school, schoolOptions]);

  useEffect(() => {
    setTerm(academicTerm);
  }, [academicTerm]);

  const handleTermSubmit = async () => {
    const normalizedTerm = term.trim();
    if (normalizedTerm.length < 4) {
      toast.error(tToast("invalidPeriod"));
      return;
    }
    await onSetAcademicTerm(normalizedTerm);
  };

  const handleSubmit = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 3 || selectedSchool.length < 3) {
      toast.error(tToast("completeCourseAndSchool"));
      return;
    }
    const payload = await onCreateCourse({
      isThesis,
      name: normalizedName,
      school: selectedSchool,
    });
    if (payload) {
      setName("");
      setCustomSchool("");
      setIsThesis(false);
    }
  };

  const handleTeacherCourseFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    const body = await file.text();
    setTeacherCourseImportCsv(body);
    setTeacherCourseImportFile(file.name);
    setTeacherCourseImportResult(null);
  };

  const handleTeacherCourseImport = async (apply: boolean) => {
    if (!teacherCourseImportCsv.trim()) {
      toast.error(tToast("selectCsvFile"));
      return;
    }
    const result = await onImportTeacherCourses({
      apply,
      csv: teacherCourseImportCsv,
      replaceTeachers: replaceTeacherCourses,
    });
    if (result) {
      setTeacherCourseImportResult(result);
    }
  };

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="min-h-0 overflow-hidden" size="sm">
        <CardHeader className="border-b px-2.5 py-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-gold" />
            {tDir("institutionalSettings")}
          </CardTitle>
          <CardDescription>
            {tDir("periodAndSchoolsAndCourses")}
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 p-0">
          <ScrollArea scrollFade scrollbarGutter>
            <div className="grid gap-2 px-2 py-1.5">
              <Field>
                <FieldLabel>{tDir("currentAcademicPeriod")}</FieldLabel>
                <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                  <Input
                    onChange={(event) => setTerm(event.target.value)}
                    placeholder="Ej. 2026.2"
                    value={term}
                  />
                  <Button
                    disabled={term.trim() === academicTerm}
                    loading={saving}
                    onClick={handleTermSubmit}
                    variant="outline"
                  >
                    {tMisc("save")}
                  </Button>
                </div>
              </Field>
              <Field className="rounded-md border bg-muted/25 p-2">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <FieldLabel>{tDir("periodClosure")}</FieldLabel>
                    <FieldDescription>
                      {periodClosed
                        ? `${tDir("periodClosed")}${periodClosedAt ? `: ${periodClosedAt}` : ""}`
                        : `${approvedCount}/${teacherCount} ${tDir("approvalsPending").toLowerCase()}`}
                    </FieldDescription>
                  </div>
                  <Badge variant={periodClosed ? "default" : "secondary"}>
                    {periodClosed ? tDir("periodClosed") : tMisc("open")}
                  </Badge>
                </div>
                <Button
                  className="w-full"
                  disabled={saving || (!periodClosed && !canClosePeriod)}
                  loading={saving}
                  onClick={() => onSetPeriodClosed(!periodClosed)}
                  variant={
                    periodClosed || !canClosePeriod ? "outline" : "default"
                  }
                >
                  {periodClosed
                    ? tDir("reopenPeriod")
                    : canClosePeriod
                      ? tDir("closePeriod")
                      : tDir("approvalsPending")}
                </Button>
              </Field>
              <Field className="rounded-md border bg-muted/25 p-2">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <FieldLabel>{tDir("csvLoad")}</FieldLabel>
                    <FieldDescription className="truncate">
                      {teacherCourseImportFile || tDir("noFileSelected")}
                    </FieldDescription>
                  </div>
                  <Upload className="mt-0.5 size-4 shrink-0 text-gold" />
                </div>
                <Input
                  accept=".csv,text/csv"
                  aria-label={tDir("csvTeachingLoad")}
                  nativeInput
                  onChange={handleTeacherCourseFile}
                  size="sm"
                  type="file"
                />
                <Field className="flex-row items-center justify-between rounded-md border bg-background/70 px-2 py-1">
                  <div>
                    <FieldLabel className="text-xs">
                      {tDir("replaceIncludedFaculty")}
                    </FieldLabel>
                    <FieldDescription>{tDir("replaceHint")}</FieldDescription>
                  </div>
                  <Switch
                    checked={replaceTeacherCourses}
                    onCheckedChange={setReplaceTeacherCourses}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    disabled={!teacherCourseImportCsv.trim() || saving}
                    loading={saving}
                    onClick={() => handleTeacherCourseImport(false)}
                    size="sm"
                    variant="outline"
                  >
                    {tDir("validate")}
                  </Button>
                  <Button
                    disabled={
                      !teacherCourseImportResult?.ok ||
                      teacherCourseImportResult.assignments === 0 ||
                      teacherCourseImportResult.applied ||
                      saving
                    }
                    loading={saving}
                    onClick={() => handleTeacherCourseImport(true)}
                    size="sm"
                  >
                    {tDir("apply")}
                  </Button>
                </div>
                {teacherCourseImportResult ? (
                  <Alert
                    className="p-2"
                    variant={teacherCourseImportResult.ok ? "success" : "error"}
                  >
                    {teacherCourseImportResult.ok ? (
                      <ShieldCheck />
                    ) : (
                      <AlertCircle />
                    )}
                    <AlertTitle>
                      {teacherCourseImportResult.ok
                        ? tDir("importAssignments", {
                            count: teacherCourseImportResult.assignments,
                          })
                        : tDir("importObservations", {
                            count: teacherCourseImportResult.errors.length,
                          })}
                    </AlertTitle>
                    <AlertDescription>
                      {teacherCourseImportResult.ok ? (
                        <span>
                          {tDir("importTeachersRows", {
                            rows: teacherCourseImportResult.rows,
                            teachers: teacherCourseImportResult.teachers,
                          })}
                        </span>
                      ) : (
                        teacherCourseImportResult.errors
                          .slice(0, 3)
                          .map((item) => (
                            <span key={item}>{formatImportError(item)}</span>
                          ))
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </Field>
              <Separator />
              <div>
                <h2 className="font-medium text-sm">{tCat("newCourse")}</h2>
                <p className="text-muted-foreground text-xs">
                  {tCat("availableForSelection")}
                </p>
              </div>
              <Field>
                <FieldLabel>{tCat("existingSchool")}</FieldLabel>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tCat("selectSchool")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>{tCat("activeSchools")}</SelectLabel>
                      {schoolOptions.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{tCat("newSchool")}</FieldLabel>
                <Input
                  onChange={(event) => setCustomSchool(event.target.value)}
                  placeholder="Opcional"
                  value={customSchool}
                />
                <FieldDescription>{tCat("newSchoolHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>{tCat("courseName")}</FieldLabel>
                <Input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Ingeniería de Software"
                  value={name}
                />
              </Field>
              <Field className="flex-row items-center justify-between rounded-md border bg-muted/25 p-2">
                <div>
                  <FieldLabel>{tCat("countsAsThesis")}</FieldLabel>
                  <FieldDescription>{tCat("thesisNoQuota")}</FieldDescription>
                </div>
                <Switch checked={isThesis} onCheckedChange={setIsThesis} />
              </Field>
              <Button
                disabled={!name.trim() || !selectedSchool}
                loading={saving}
                onClick={handleSubmit}
              >
                <Plus data-icon="inline-start" />
                {tCat("saveCourse")}
              </Button>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <Card className="min-h-0 overflow-hidden" size="sm">
        <CardHeader className="grid shrink-0 gap-1.5 border-b px-2.5 py-1.5 xl:grid-cols-[minmax(0,1fr)_minmax(560px,auto)] xl:items-center">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate font-serif text-xl">
                {tCat("catalogSettings")}
              </CardTitle>
              <CardDescription className="truncate">
                {tCat("activeCoursesDescription")}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {filteredCatalog.length}/{catalog.length}
            </Badge>
          </div>
          <div className="grid gap-1.5 md:grid-cols-[minmax(180px,1fr)_150px_190px]">
            <Input
              aria-label={tCat("searchCourse")}
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder={tCat("searchCourseOrSchool")}
              size="sm"
              type="search"
              value={catalogQuery}
            />
            <Select
              value={catalogStatusFilter}
              onValueChange={(value) =>
                setCatalogStatusFilter(value as CourseStatusFilter)
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tCat("status")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tCat("status")}</SelectLabel>
                  <SelectItem value="all">{tCat("anyStatus")}</SelectItem>
                  <SelectItem value="active">
                    {tCat("active")} ({activeCount})
                  </SelectItem>
                  <SelectItem value="suspended">
                    {tCat("suspended")} ({inactiveCount})
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={catalogSchoolFilter}
              onValueChange={setCatalogSchoolFilter}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tCat("school")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tCat("school")}</SelectLabel>
                  <SelectItem value="all">{tCat("allSchools")}</SelectItem>
                  {catalogSchools.map((schoolName) => (
                    <SelectItem key={schoolName} value={schoolName}>
                      {schoolName}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <CourseCatalogTable
            catalog={filteredCatalog}
            clearFilters={clearCatalogFilters}
            filtersActive={catalogFiltersActive}
            onSetCourseActive={onSetCourseActive}
            saving={saving}
          />
        </CardContent>
      </Card>
    </section>
  );
}

function CourseCatalogTable({
  catalog,
  clearFilters,
  filtersActive,
  onSetCourseActive,
  saving,
}: {
  catalog: Course[];
  clearFilters: () => void;
  filtersActive: boolean;
  onSetCourseActive: (courseId: string, active: boolean) => Promise<void>;
  saving: boolean;
}) {
  const tCat = useTranslations("catalog");
  const _tMisc = useTranslations("misc");
  if (!catalog.length) {
    return (
      <Empty className="h-full py-10">
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {filtersActive ? tCat("noMatches") : tCat("noCoursesConfigured")}
          </EmptyTitle>
          <EmptyDescription>
            {filtersActive
              ? tCat("adjustSearchStatusSchool")
              : tCat("addFirstCourse")}
          </EmptyDescription>
        </EmptyHeader>
        {filtersActive ? (
          <EmptyContent>
            <Button onClick={clearFilters} size="sm" variant="outline">
              {tCat("clearFilters")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <ScrollArea scrollbarGutter>
      <Table className="text-sm">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="h-9">
            <TableHead className="h-9 w-12 px-2">{tCat("number")}</TableHead>
            <TableHead className="h-9 px-2">{tCat("course")}</TableHead>
            <TableHead className="h-9 px-2">
              {tCat("professionalSchool")}
            </TableHead>
            <TableHead className="h-9 w-28 px-2">{tCat("status")}</TableHead>
            <TableHead className="h-9 w-24 px-2 text-right">
              {tCat("activeLabel")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {catalog.map((course, index) => {
            const active = course.active !== false;
            return (
              <TableRow className="h-12" key={course.id}>
                <TableCell className="px-2 py-1 text-muted-foreground tabular-nums">
                  {index + 1}
                </TableCell>
                <TableCell className="px-2 py-1">
                  <div className="font-medium">{course.name}</div>
                  <div className="text-muted-foreground text-xs">
                    {courseMeta(course, tCat)}
                  </div>
                  {course.isThesis ? (
                    <Badge variant="secondary" className="ml-2">
                      {tCat("thesis")}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-1 text-muted-foreground">
                  {course.school}
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Badge variant={active ? "default" : "secondary"}>
                    {active ? tCat("activeLabel") : tCat("suspendedLabel")}
                  </Badge>
                </TableCell>
                <TableCell className="px-2 py-1 text-right">
                  <Switch
                    checked={active}
                    disabled={saving}
                    onCheckedChange={(checked) =>
                      onSetCourseActive(course.id, checked)
                    }
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function UsersAccessView({
  currentUserId,
  departments: departmentOptions,
  onSetUserAccess,
  saving,
  users,
}: {
  currentUserId: string;
  departments: string[];
  onSetUserAccess: (
    userId: string,
    role: AppRole,
    school: string,
  ) => Promise<SchedulePayload | null>;
  saving: boolean;
  users: ScheduleUser[];
}) {
  const tUsers = useTranslations("users");
  const tMisc = useTranslations("misc");
  const tStatus = useTranslations("status");
  const _tRoutes = useTranslations("routes");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRoleFilter>("all");
  const [onboardingFilter, setOnboardingFilter] =
    useState<UserOnboardingFilter>("all");
  const adminCount = users.filter((user) => user.role === "admin").length;
  const directionCount = users.filter(
    (user) => user.role === "direccion",
  ).length;
  const teacherCount = users.filter((user) => user.role === "docente").length;
  const pendingAccess = users.filter((user) => !user.onboardingComplete).length;
  const filteredUsers = filterUsers(users, {
    onboardingFilter,
    query,
    roleFilter,
    t: tStatus,
    tRole: tMisc,
    tUsers,
  });
  const filtersActive =
    query.trim().length > 0 ||
    roleFilter !== "all" ||
    onboardingFilter !== "all";
  const clearFilters = () => {
    setQuery("");
    setRoleFilter("all");
    setOnboardingFilter("all");
  };

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="min-h-0 overflow-hidden" size="sm">
        <CardHeader className="grid shrink-0 gap-1.5 border-b px-2.5 py-1.5 2xl:grid-cols-[minmax(0,1fr)_minmax(460px,auto)] 2xl:items-center">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate font-serif text-xl">
                {tUsers("institutionalUsers")}
              </CardTitle>
              <CardDescription className="truncate">
                {tUsers("facultyCount")}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {filteredUsers.length}/{users.length}
            </Badge>
          </div>
          <div className="grid gap-1.5 md:grid-cols-[minmax(180px,1fr)_160px_160px]">
            <Input
              aria-label={tUsers("searchUser")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tUsers("searchNameOrEmail")}
              size="sm"
              type="search"
              value={query}
            />
            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter(value as UserRoleFilter)}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tUsers("role")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tUsers("role")}</SelectLabel>
                  <SelectItem value="all">{tUsers("allRoles")}</SelectItem>
                  <SelectItem value="admin">{tUsers("admin")}</SelectItem>
                  <SelectItem value="direccion">
                    {tUsers("direction")}
                  </SelectItem>
                  <SelectItem value="docente">{tUsers("faculty")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={onboardingFilter}
              onValueChange={(value) =>
                setOnboardingFilter(value as UserOnboardingFilter)
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tUsers("accessLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tUsers("accessLabel")}</SelectLabel>
                  <SelectItem value="all">{tUsers("anyAccess")}</SelectItem>
                  <SelectItem value="complete">
                    {tUsers("hasSignedIn")}
                  </SelectItem>
                  <SelectItem value="pending">{tUsers("noSignIn")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <UsersAccessTable
            clearFilters={clearFilters}
            currentUserId={currentUserId}
            filtersActive={filtersActive}
            onSetUserAccess={onSetUserAccess}
            saving={saving}
            departments={departmentOptions}
            users={filteredUsers}
          />
        </CardContent>
      </Card>
      <aside className="grid min-h-0 gap-3 xl:grid-rows-[auto_auto_minmax(0,1fr)]">
        <Card size="sm">
          <CardHeader className="border-b px-2.5 py-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-availability" />
              {tUsers("access")}
            </CardTitle>
            <CardDescription>{tMisc("operationalSummary")}</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 px-2.5 py-2">
            <StatusMetric label={tUsers("admin")} value={String(adminCount)} />
            <StatusMetric
              label={tUsers("direction")}
              value={String(directionCount)}
            />
            <StatusMetric
              label={tUsers("faculty")}
              value={String(teacherCount)}
            />
          </CardContent>
        </Card>
        <Alert variant={adminCount > 0 ? "default" : "warning"}>
          <Info />
          <AlertTitle>{tMisc("securityRule")}</AlertTitle>
          <AlertDescription>
            {tUsers("keepOneAdmin")} {pendingAccess}.
          </AlertDescription>
        </Alert>
      </aside>
    </section>
  );
}

function UsersAccessTable({
  clearFilters,
  currentUserId,
  departments: departmentOptions,
  filtersActive,
  onSetUserAccess,
  saving,
  users,
}: {
  clearFilters: () => void;
  currentUserId: string;
  departments: string[];
  filtersActive: boolean;
  onSetUserAccess: (
    userId: string,
    role: AppRole,
    school: string,
  ) => Promise<SchedulePayload | null>;
  saving: boolean;
  users: ScheduleUser[];
}) {
  const locale = useLocale();
  const tUsers = useTranslations("users");
  const tMisc = useTranslations("misc");
  const tStatus = useTranslations("status");
  const tCat = useTranslations("catalog");
  if (!users.length) {
    return (
      <Empty className="h-full py-10">
        <EmptyMedia variant="icon">
          <UserCog />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {filtersActive ? tMisc("noMatches") : tUsers("noUsers")}
          </EmptyTitle>
          <EmptyDescription>
            {filtersActive
              ? tUsers("adjustSearchRoleAccess")
              : tUsers("usersAppearAfterSignIn")}
          </EmptyDescription>
        </EmptyHeader>
        {filtersActive ? (
          <EmptyContent>
            <Button onClick={clearFilters} size="sm" variant="outline">
              {tCat("clearFilters")}
            </Button>
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <ScrollArea scrollbarGutter>
      <Table className="min-w-[1180px] text-sm">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="h-9">
            <TableHead className="h-9 min-w-[250px] px-2">
              {tMisc("user")}
            </TableHead>
            <TableHead className="h-9 w-52 px-2">{tMisc("roster")}</TableHead>
            <TableHead className="h-9 w-40 px-2">{tUsers("role")}</TableHead>
            <TableHead className="h-9 w-56 px-2">
              {tMisc("periodLabel")}
            </TableHead>
            <TableHead className="h-9 w-36 px-2">{tUsers("access")}</TableHead>
            <TableHead className="h-9 w-32 px-2">{tMisc("schedule")}</TableHead>
            <TableHead className="h-9 w-36 px-2 text-right">
              {tMisc("updated")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => {
            const isSelf = user.clerkUserId === currentUserId;
            return (
              <TableRow className="h-12" key={user.clerkUserId}>
                <TableCell className="px-2 py-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <Avatar size="sm">
                      {user.imageUrl ? (
                        <AvatarImage src={user.imageUrl} alt={user.name} />
                      ) : null}
                      <AvatarFallback>{initialsFor(user.name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {user.name}
                        {isSelf ? (
                          <Badge variant="secondary" className="ml-2">
                            {tMisc("you")}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-muted-foreground text-xs">
                        {user.email}
                      </div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1">
                  <div className="min-w-0">
                    <div className="truncate font-medium tabular-nums">
                      {user.teacherCode ?? tMisc("noCode")}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {user.teacherCategory ?? tMisc("noCategory")}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {user.academicDegree ?? tMisc("noAcademicDegree")}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Select
                    disabled={saving || isSelf}
                    value={user.role}
                    onValueChange={(role) =>
                      onSetUserAccess(
                        user.clerkUserId,
                        role as AppRole,
                        user.school,
                      )
                    }
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{tUsers("role")}</SelectLabel>
                        <SelectItem value="admin">{tUsers("admin")}</SelectItem>
                        <SelectItem value="docente">
                          {tUsers("faculty")}
                        </SelectItem>
                        <SelectItem value="direccion">
                          {tUsers("direction")}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Select
                    disabled={saving}
                    value={user.school}
                    onValueChange={(department) =>
                      onSetUserAccess(user.clerkUserId, user.role, department)
                    }
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>{tMisc("periodLabel")}</SelectLabel>
                        {departmentOptions.map((department) => (
                          <SelectItem key={department} value={department}>
                            {department}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Badge
                    variant={user.onboardingComplete ? "default" : "secondary"}
                  >
                    {user.onboardingComplete
                      ? tUsers("hasSignedIn")
                      : tUsers("noSignIn")}
                  </Badge>
                  <div className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                    {user.lastSeenAt
                      ? formatEventDate(user.lastSeenAt, locale)
                      : tMisc("never")}
                  </div>
                </TableCell>
                <TableCell className="px-2 py-1">
                  {user.teacherStatus ? (
                    <Badge
                      variant={
                        user.teacherStatus === "enviado" ||
                        user.teacherStatus === "aprobado"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {statusLabel(user.teacherStatus, tStatus)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">
                      {tMisc("notApplicable")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-1 text-right text-muted-foreground text-xs tabular-nums">
                  {formatEventDate(user.updatedAt, locale)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function AuditView({ events }: { events: ScheduleEvent[] }) {
  const locale = useLocale();
  const t = useTranslations("audit");
  const tEvents = useTranslations("events");
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const eventTypes = useMemo(
    () => Array.from(new Set(events.map((event) => event.eventType))).sort(),
    [events],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesType =
          eventType === "all" || event.eventType === eventType;
        const normalizedQuery = query.trim().toLowerCase();
        if (!matchesType) {
          return false;
        }
        if (!normalizedQuery) {
          return true;
        }
        return [
          event.actorName,
          event.teacherId,
          eventLabel(event.eventType, tEvents),
          event.eventType,
          eventSummary(event, tEvents),
          JSON.stringify(event.metadata),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [eventType, events, query, tEvents],
  );

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3">
      <Card className="min-h-0 overflow-hidden" size="sm">
        <CardHeader className="flex shrink-0 flex-col gap-1.5 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate font-serif text-xl">
              {t("institutionalAudit")}
            </CardTitle>
            <CardDescription className="truncate">
              {t("institutionalHistory")}
            </CardDescription>
          </div>
          <div className="grid w-full shrink-0 gap-2 md:grid-cols-[220px_220px_auto] lg:w-auto">
            <Input
              aria-label={t("searchAudit")}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchAudit")}
              value={query}
            />
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("eventType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("eventType")}</SelectLabel>
                  <SelectItem value="all">{t("all")}</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {eventLabel(type, tEvents)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              disabled={!filteredEvents.length}
              onClick={() => exportAuditCsv(filteredEvents, locale, t, tEvents)}
              variant="outline"
            >
              <ArrowDownToLine data-icon="inline-start" />
              CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          {filteredEvents.length ? (
            <AuditEventsTable events={filteredEvents} />
          ) : (
            <Empty className="h-full py-10">
              <EmptyMedia variant="icon">
                <History />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{t("noEvents")}</EmptyTitle>
                <EmptyDescription>{t("adjustSearchOrType")}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AuditEventsTable({ events }: { events: ScheduleEvent[] }) {
  const locale = useLocale();
  const t = useTranslations("audit");
  const tEvents = useTranslations("events");
  const tMisc = useTranslations("misc");
  return (
    <ScrollArea scrollbarGutter>
      <Table className="text-sm">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="h-9">
            <TableHead className="h-9 min-w-[180px] px-2">
              {t("date")}
            </TableHead>
            <TableHead className="h-9 min-w-[220px] px-2">
              {t("event")}
            </TableHead>
            <TableHead className="h-9 min-w-[180px] px-2">
              {t("actor")}
            </TableHead>
            <TableHead className="h-9 min-w-[180px] px-2">
              {t("reference")}
            </TableHead>
            <TableHead className="h-9 px-2">{t("detail")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow className="h-11" key={event.id}>
              <TableCell className="px-2 py-1 text-muted-foreground text-xs tabular-nums">
                {formatEventDate(event.createdAt, locale)}
              </TableCell>
              <TableCell className="px-2 py-1">
                <div className="font-medium">
                  {eventLabel(event.eventType, tEvents)}
                </div>
                <div className="text-muted-foreground text-xs">
                  {eventScopeLabel(event.eventType, tEvents)}
                </div>
              </TableCell>
              <TableCell className="px-2 py-1">{event.actorName}</TableCell>
              <TableCell className="px-2 py-1 text-muted-foreground">
                {event.teacherId}
              </TableCell>
              <TableCell className="px-2 py-1 text-muted-foreground">
                {eventSummary(event, t) || tMisc("notApplicable")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function TeacherStatusPanel({
  onSubmit,
  periodClosed,
  profile,
  saving,
  validation,
}: {
  onSubmit: () => void;
  periodClosed: boolean;
  profile: TeacherProfile;
  saving?: boolean;
  validation: Validation;
}) {
  const tTeacher = useTranslations("teacher");
  const tReview = useTranslations("review");
  const tMisc = useTranslations("misc");
  const tRules = useTranslations("ruleMessages");
  const rule = contractRules[profile.contract];
  const courseLabel =
    rule.maxCourses === 1 ? tRules("courseSingular") : tRules("coursePlural");
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-2.5 py-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              {validation.complete ? (
                <ShieldCheck className="size-4 text-availability" />
              ) : (
                <AlertCircle className="size-4 text-gold" />
              )}
              {tTeacher("submission")}
            </CardTitle>
            <CardDescription className="hidden sm:block">
              {tRules("shortSummary", {
                courseLabel,
                days: rule.requiredBlockDays,
                hours: rule.requiredHours,
                maxCourses: rule.maxCourses,
              })}
            </CardDescription>
          </div>
          <Badge variant={validation.complete ? "default" : "secondary"}>
            {validation.complete ? tReview("ready") : tReview("pending")}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 px-2.5 py-2 text-sm">
        {profile.reviewNote ? (
          <Alert variant="warning" className="p-2.5">
            <AlertCircle />
            <AlertTitle>{tTeacher("submission")}</AlertTitle>
            <AlertDescription>{profile.reviewNote}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <StatusMetric
            label={tTeacher("hours")}
            value={`${validation.selectedHours}/${rule.requiredHours}`}
          />
          <StatusMetric
            label={tTeacher("validDays")}
            value={`${validation.blockDays}/${rule.requiredBlockDays}`}
          />
          <StatusMetric
            label={tTeacher("courses")}
            value={`${validation.countedCourses}/${rule.maxCourses}`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-muted-foreground">
            {profile.approvedAt
              ? `${tReview("ready")}: ${profile.approvedAt}`
              : profile.submittedAt
                ? `${tTeacher("submission")}: ${profile.submittedAt}`
                : tMisc("notApplicable")}
          </span>
          <Button
            size="sm"
            disabled={periodClosed || !validation.complete}
            loading={saving}
            onClick={onSubmit}
          >
            {tTeacher("submit")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/35 p-2">
      <div className="truncate text-muted-foreground text-xs">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function DirectorView({
  catalog,
  courseSavingIds,
  events,
  exportTeacherCount,
  handleApproveTeacher,
  handleAssignTeacherCourse,
  handleExportAllPdf,
  handleExportPdf,
  handleExportXlsx,
  handleObserveTeacher,
  handleUnassignTeacherCourse,
  periodClosed,
  reviewNote,
  selectedTeacher,
  selectedTeacherId,
  selectedTeacherVisible,
  saving,
  schools,
  setReviewNote,
  setSelectedTeacherId,
  setShowOnlyPending,
  setTeacherQuery,
  setTeacherStatusFilter,
  showOnlyPending,
  teacherQuery,
  teacherStatusFilter,
  teachers,
  reviewCounts,
  totalTeacherCount,
  validation,
}: {
  catalog: Course[];
  courseSavingIds: string[];
  events: ScheduleEvent[];
  exportTeacherCount: number;
  handleApproveTeacher: () => Promise<void>;
  handleAssignTeacherCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  handleExportAllPdf: () => Promise<void>;
  handleExportPdf: () => Promise<void>;
  handleExportXlsx: () => Promise<void>;
  handleObserveTeacher: () => Promise<void>;
  handleUnassignTeacherCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  periodClosed: boolean;
  reviewNote: string;
  selectedTeacher: TeacherProfile;
  selectedTeacherId: string;
  selectedTeacherVisible: boolean;
  saving: boolean;
  schools: string[];
  setReviewNote: (note: string) => void;
  setSelectedTeacherId: (id: string) => void;
  setShowOnlyPending: (value: boolean) => void;
  setTeacherQuery: (value: string) => void;
  setTeacherStatusFilter: (value: TeacherStatusFilter) => void;
  showOnlyPending: boolean;
  teacherQuery: string;
  teacherStatusFilter: TeacherStatusFilter;
  teachers: TeacherProfile[];
  reviewCounts: TeacherStatusCounts;
  totalTeacherCount: number;
  validation: Validation;
}) {
  const tDir = useTranslations("direction");
  const _tTeacher = useTranslations("teacher");
  const tStatus = useTranslations("status");
  const tMisc = useTranslations("misc");
  const tContracts = useTranslations("contracts");
  const tCat = useTranslations("catalog");
  const teacherFiltersActive =
    showOnlyPending ||
    teacherStatusFilter !== "all" ||
    teacherQuery.trim().length > 0;
  const selectedTeacherUnavailable = !selectedTeacherVisible;

  return (
    <section className="grid h-full min-h-0 grid-rows-[minmax(220px,32vh)_minmax(0,1fr)] gap-3 overflow-hidden p-3 xl:grid-cols-[280px_minmax(0,1fr)] xl:grid-rows-none 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="grid gap-1 border-b px-2 py-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {tDir("facultyList")}
              </CardTitle>
              <CardDescription className="truncate">
                {tMisc("operationalSummary")}
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {teachers.length}/{totalTeacherCount}
            </Badge>
          </div>
          <div className="grid gap-1">
            <Input
              aria-label={tDir("searchFaculty")}
              onChange={(event) => setTeacherQuery(event.target.value)}
              placeholder={tDir("searchFacultyOrEmail")}
              size="sm"
              type="search"
              value={teacherQuery}
            />
            <Select
              value={teacherStatusFilter}
              onValueChange={(value) =>
                setTeacherStatusFilter(value as TeacherStatusFilter)
              }
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tMisc("periodLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tMisc("periodLabel")}</SelectLabel>
                  <SelectItem value="all">{tDir("allStatuses")}</SelectItem>
                  <SelectItem value="borrador">{tStatus("draft")}</SelectItem>
                  <SelectItem value="enviado">
                    {tStatus("submitted")}
                  </SelectItem>
                  <SelectItem value="observado">
                    {tStatus("observed")}
                  </SelectItem>
                  <SelectItem value="aprobado">
                    {tStatus("approved")}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <TeacherQueueMetrics
            counts={reviewCounts}
            totalTeacherCount={totalTeacherCount}
          />
          <DirectorOperationsSnapshot events={events} teachers={teachers} />
          <Field className="flex-row items-center justify-between gap-2 rounded-md bg-muted/25 px-2 py-0.5">
            <div>
              <FieldLabel className="text-xs">{tDir("pendingOnly")}</FieldLabel>
              <FieldDescription>{tDir("hidesApproved")}</FieldDescription>
            </div>
            <Switch
              checked={showOnlyPending}
              onCheckedChange={setShowOnlyPending}
            />
          </Field>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-1.5">
          <ScrollArea scrollFade scrollbarGutter>
            <div className="space-y-2">
              {teachers.length ? (
                teachers.map((teacher, index) => (
                  <TeacherButton
                    index={index}
                    key={teacher.id}
                    onClick={() => setSelectedTeacherId(teacher.id)}
                    selected={selectedTeacherId === teacher.id}
                    teacher={teacher}
                  />
                ))
              ) : (
                <Empty className="py-10">
                  <EmptyMedia variant="icon">
                    <Users />
                  </EmptyMedia>
                  <EmptyHeader>
                    <EmptyTitle>
                      {teacherFiltersActive
                        ? tDir("noVisibleFaculty")
                        : tDir("noPendingFaculty")}
                    </EmptyTitle>
                    <EmptyDescription>
                      {teacherFiltersActive
                        ? tDir("adjustSearchOrStatus")
                        : tDir("disableFilterHint")}
                    </EmptyDescription>
                  </EmptyHeader>
                  {teacherFiltersActive ? (
                    <EmptyContent>
                      <Button
                        onClick={() => {
                          setTeacherQuery("");
                          setTeacherStatusFilter("all");
                          setShowOnlyPending(false);
                        }}
                        size="sm"
                        variant="outline"
                      >
                        {tCat("clearFilters")}
                      </Button>
                    </EmptyContent>
                  ) : null}
                </Empty>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <div className="min-h-0">
        {selectedTeacherUnavailable ? (
          <Card className="h-full min-h-0 overflow-hidden">
            <Empty className="h-full">
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>
                  {teacherFiltersActive
                    ? tDir("noVisibleFaculty")
                    : tDir("noFacultyToReview")}
                </EmptyTitle>
                <EmptyDescription>
                  {teacherFiltersActive
                    ? tDir("clearOrAdjustFilters")
                    : tDir("facultyAppearAfterAccess")}
                </EmptyDescription>
              </EmptyHeader>
              {teacherFiltersActive ? (
                <EmptyContent>
                  <Button
                    onClick={() => {
                      setTeacherQuery("");
                      setTeacherStatusFilter("all");
                      setShowOnlyPending(false);
                    }}
                    variant="outline"
                  >
                    {tCat("clearFilters")}
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </Card>
        ) : (
          <Card className="h-full min-h-0 overflow-hidden">
            <CardHeader className="flex shrink-0 flex-col gap-1.5 border-b px-3 py-1.5 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <CardTitle className="truncate font-serif text-xl">
                  {selectedTeacher.name}
                </CardTitle>
                <CardDescription className="truncate">
                  {teacherProfileSummary(
                    selectedTeacher,
                    tContracts,
                    tStatus,
                    tMisc,
                  )}
                </CardDescription>
              </div>
              <Toolbar className="shrink-0 border-0 bg-transparent p-0 shadow-none">
                <ToolbarGroup>
                  <Sheet>
                    <SheetTrigger
                      render={
                        <Button variant="outline" className="2xl:hidden" />
                      }
                    >
                      <BookOpen data-icon="inline-start" />
                      {tMisc("updated")}
                    </SheetTrigger>
                    <SheetContent side="right">
                      <SheetHeader>
                        <SheetTitle>{selectedTeacher.name}</SheetTitle>
                        <SheetDescription>
                          {tDir("coursesAndRules")}
                        </SheetDescription>
                      </SheetHeader>
                      <SheetPanel className="min-h-0 p-3">
                        <DirectorDetailTabs
                          events={events}
                          catalog={catalog}
                          onApproveTeacher={handleApproveTeacher}
                          onAssignTeacherCourse={handleAssignTeacherCourse}
                          onObserveTeacher={handleObserveTeacher}
                          onUnassignTeacherCourse={handleUnassignTeacherCourse}
                          periodClosed={periodClosed}
                          reviewNote={reviewNote}
                          saving={
                            saving ||
                            courseSavingIds.includes(selectedTeacher.id)
                          }
                          selectedTeacher={selectedTeacher}
                          setReviewNote={setReviewNote}
                          schools={schools}
                          validation={validation}
                        />
                      </SheetPanel>
                    </SheetContent>
                  </Sheet>
                  <ToolbarButton
                    onClick={handleExportAllPdf}
                    render={
                      <Button
                        disabled={exportTeacherCount === 0}
                        variant="outline"
                      />
                    }
                  >
                    <Files data-icon="inline-start" />
                    {tDir("allPdfs")}
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={handleExportPdf}
                    render={<Button variant="outline" />}
                  >
                    <ArrowDownToLine data-icon="inline-start" />
                    PDF
                  </ToolbarButton>
                  <ToolbarButton onClick={handleExportXlsx} render={<Button />}>
                    <FileSpreadsheet data-icon="inline-start" />
                    {tDir("excel")}
                  </ToolbarButton>
                </ToolbarGroup>
              </Toolbar>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <ScheduleBoard
                availability={selectedTeacher.availability}
                emptyDescription={tDir("facultyNotMarkedBlocks")}
                emptyLabel={tDir("noAvailabilityRecorded")}
              />
            </CardContent>
          </Card>
        )}
      </div>
      <aside className="hidden min-h-0 2xl:block">
        {selectedTeacherUnavailable ? null : (
          <DirectorDetailTabs
            events={events}
            catalog={catalog}
            onApproveTeacher={handleApproveTeacher}
            onAssignTeacherCourse={handleAssignTeacherCourse}
            onObserveTeacher={handleObserveTeacher}
            onUnassignTeacherCourse={handleUnassignTeacherCourse}
            periodClosed={periodClosed}
            reviewNote={reviewNote}
            saving={saving || courseSavingIds.includes(selectedTeacher.id)}
            selectedTeacher={selectedTeacher}
            setReviewNote={setReviewNote}
            schools={schools}
            validation={validation}
          />
        )}
      </aside>
    </section>
  );
}

function TeacherQueueMetrics({
  counts,
  totalTeacherCount,
}: {
  counts: TeacherStatusCounts;
  totalTeacherCount: number;
}) {
  const tStatus = useTranslations("status");
  const rows: Array<{
    label: string;
    value: number;
    tone: "default" | "secondary";
  }> = [
    { label: tStatus("draft"), value: counts.borrador, tone: "secondary" },
    { label: tStatus("submitted"), value: counts.enviado, tone: "default" },
    {
      label: `${tStatus("observed").slice(0, 4)}.`,
      value: counts.observado,
      tone: "secondary",
    },
    {
      label: `${tStatus("approved").slice(0, 5)}.`,
      value: counts.aprobado,
      tone: "default",
    },
  ];
  return (
    <div className="hidden grid-cols-2 gap-1 md:grid">
      {rows.map((row) => (
        <div
          className="rounded-md border bg-muted/30 px-1.5 py-1"
          key={row.label}
        >
          <div className="truncate text-[10px] text-muted-foreground">
            {row.label}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-xs tabular-nums">
              {row.value}
            </span>
            <Badge className="h-4 px-1 text-[10px]" variant={row.tone}>
              {totalTeacherCount
                ? Math.round((row.value / totalTeacherCount) * 100)
                : 0}
              %
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectorOperationsSnapshot({
  events,
  teachers,
}: {
  events: ScheduleEvent[];
  teachers: TeacherProfile[];
}) {
  const tDir = useTranslations("direction");
  const tMisc = useTranslations("misc");
  const tTeacher = useTranslations("teacher");
  const totalTeachers = teachers.length;
  const teachersWithCourses = teachers.filter(
    (teacher) => teacher.courses.length > 0,
  ).length;
  const teachersWithAvailability = teachers.filter(
    (teacher) => teacher.availability.length > 0,
  ).length;
  const assignedCourses = teachers.reduce(
    (total, teacher) => total + teacher.courses.length,
    0,
  );
  const rows = [
    {
      label: tDir("csvLoad"),
      value: `${teachersWithCourses}/${totalTeachers}`,
      detail: `${assignedCourses} ${tTeacher("courses").toLowerCase()}`,
      warning: assignedCourses === 0,
    },
    {
      label: tMisc("schedule"),
      value: `${teachersWithAvailability}/${totalTeachers}`,
      warning: teachersWithAvailability === 0,
    },
    {
      label: tDir("eventsLabel"),
      value: String(events.length),
      detail: tDir("audited"),
      warning: events.length === 0,
    },
  ];

  return (
    <div className="hidden grid-cols-3 gap-1 xl:grid">
      {rows.map((row) => (
        <div
          className={cn(
            "rounded-md border px-1.5 py-1",
            row.warning ? "border-warning/45 bg-warning/10" : "bg-muted/30",
          )}
          key={row.label}
        >
          <div className="truncate text-[10px] text-muted-foreground">
            {row.label}
          </div>
          <div className="truncate font-semibold text-xs tabular-nums">
            {row.value}
          </div>
          <div className="truncate text-[10px] text-muted-foreground">
            {row.detail}
          </div>
        </div>
      ))}
    </div>
  );
}

function DirectorDetailTabs({
  catalog,
  events,
  onApproveTeacher,
  onAssignTeacherCourse,
  onObserveTeacher,
  onUnassignTeacherCourse,
  periodClosed,
  reviewNote,
  saving,
  selectedTeacher,
  setReviewNote,
  schools,
  validation,
}: {
  catalog: Course[];
  events: ScheduleEvent[];
  onApproveTeacher: () => Promise<void>;
  onAssignTeacherCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  onObserveTeacher: () => Promise<void>;
  onUnassignTeacherCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  periodClosed: boolean;
  reviewNote: string;
  saving: boolean;
  selectedTeacher: TeacherProfile;
  setReviewNote: (note: string) => void;
  schools: string[];
  validation: Validation;
}) {
  const tDir = useTranslations("direction");
  return (
    <Tabs defaultValue="revision" className="h-full min-h-0 w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="revision">{tDir("tabRevision")}</TabsTrigger>
        <TabsTrigger value="cursos">{tDir("tabCourses")}</TabsTrigger>
        <TabsTrigger value="auditoria">{tDir("tabAudit")}</TabsTrigger>
      </TabsList>
      <TabsContent
        value="revision"
        className="grid min-h-0 auto-rows-max content-start gap-3 overflow-y-auto pr-1"
      >
        <RulePanel profile={selectedTeacher} validation={validation} />
        <DirectorReviewCard
          onApproveTeacher={onApproveTeacher}
          onObserveTeacher={onObserveTeacher}
          periodClosed={periodClosed}
          reviewNote={reviewNote}
          saving={saving}
          selectedTeacher={selectedTeacher}
          setReviewNote={setReviewNote}
          validation={validation}
        />
      </TabsContent>
      <TabsContent value="cursos" className="min-h-0 overflow-hidden">
        <CoursesReviewCard
          catalog={catalog}
          disabled={periodClosed}
          onAssignCourse={onAssignTeacherCourse}
          onRemoveCourse={onUnassignTeacherCourse}
          saving={saving}
          schools={schools}
          teacher={selectedTeacher}
        />
      </TabsContent>
      <TabsContent value="auditoria" className="min-h-0 overflow-hidden">
        <AuditTrailCard events={events} />
      </TabsContent>
    </Tabs>
  );
}

function CoursesReviewCard({
  catalog,
  disabled,
  onAssignCourse,
  onRemoveCourse,
  saving,
  schools,
  teacher,
}: {
  catalog: Course[];
  disabled: boolean;
  onAssignCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  onRemoveCourse: (
    teacherId: string,
    courseId: string,
  ) => Promise<SchedulePayload | null>;
  saving: boolean;
  schools: string[];
  teacher: TeacherProfile;
}) {
  const tDir = useTranslations("direction");
  const tTeacher = useTranslations("teacher");
  const tCatalog = useTranslations("catalog");
  const tContracts = useTranslations("contracts");
  const catalogSchools = useMemo(
    () =>
      Array.from(
        new Set([...schools, ...catalog.map((course) => course.school)]),
      )
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [catalog, schools],
  );
  const defaultSchool = teacher.courses[0]?.school ?? catalogSchools[0] ?? "";
  const [school, setSchool] = useState(defaultSchool);
  const visibleCatalog = useMemo(
    () => visibleCoursesForSchool(catalog, school),
    [catalog, school],
  );
  const [courseId, setCourseId] = useState(visibleCatalog[0]?.id ?? "");
  const selectedCourse = visibleCatalog.find(
    (course) => course.id === courseId,
  );
  const assignment = courseAssignmentState(teacher, selectedCourse);
  const assignDisabled = disabled || saving || !assignment.canAssign;
  const assignLabel = disabled
    ? tTeacher("closed")
    : assignment.alreadyAssigned
      ? tTeacher("assigned")
      : assignment.limitReached
        ? tTeacher("quotaFull")
        : tTeacher("assign");

  useEffect(() => {
    setSchool(defaultSchool);
  }, [defaultSchool]);

  useEffect(() => {
    setCourseId((current) =>
      visibleCatalog.some((course) => course.id === current)
        ? current
        : (visibleCatalog[0]?.id ?? ""),
    );
  }, [visibleCatalog]);

  const handleAssign = async () => {
    if (!courseId) {
      return;
    }
    await onAssignCourse(teacher.id, courseId);
  };

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="shrink-0 border-b px-3 py-1.5">
        <CardTitle className="text-base">{tDir("facultyCourses")}</CardTitle>
        <CardDescription>{tDir("administrativeLoad")}</CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 px-2 py-2">
        <div className="grid gap-1.5">
          <Select
            disabled={disabled || saving}
            value={school}
            onValueChange={setSchool}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder={tTeacher("schoolLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>{tDir("professionalSchool")}</SelectLabel>
                {catalogSchools.map((item) => (
                  <SelectItem key={item} value={item}>
                    {item}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-1.5">
            <Select
              disabled={disabled || saving || !visibleCatalog.length}
              value={courseId}
              onValueChange={setCourseId}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder={tTeacher("courseLabel")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{tCatalog("course")}</SelectLabel>
                  {visibleCatalog.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {courseLabel(course)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              disabled={assignDisabled}
              loading={saving}
              onClick={handleAssign}
              size="sm"
            >
              <Plus data-icon="inline-start" />
              {assignLabel}
            </Button>
          </div>
          {assignment.limitReached ? (
            <p className="text-muted-foreground text-xs">
              {tContracts(
                contractRules[teacher.contract].label.slice(
                  "contracts.".length,
                ),
              )}
              : {contractRules[teacher.contract].maxCourses}{" "}
              {tDir("nonThesisCourses")}
            </p>
          ) : null}
        </div>
        <div className="h-[clamp(160px,34vh,320px)] min-h-0 overflow-hidden rounded-md border bg-muted/20">
          <CourseCardsList
            courses={teacher.courses}
            emptyDescription={tDir("assignFromCatalog")}
            emptyTitle={tDir("noAssignedCourses")}
            onRemoveCourse={
              disabled
                ? undefined
                : (courseIdValue) => onRemoveCourse(teacher.id, courseIdValue)
            }
            removeDisabled={saving}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function DirectorReviewCard({
  onApproveTeacher,
  onObserveTeacher,
  periodClosed,
  reviewNote,
  saving,
  selectedTeacher,
  setReviewNote,
  validation,
}: {
  onApproveTeacher: () => Promise<void>;
  onObserveTeacher: () => Promise<void>;
  periodClosed: boolean;
  reviewNote: string;
  saving: boolean;
  selectedTeacher: TeacherProfile;
  setReviewNote: (note: string) => void;
  validation: Validation;
}) {
  const tDir = useTranslations("direction");
  const canApprove =
    !periodClosed &&
    selectedTeacher.status === "enviado" &&
    validation.complete;
  const canObserve = !periodClosed && selectedTeacher.status !== "borrador";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-3 py-1.5">
        <CardTitle className="text-base">{tDir("decision")}</CardTitle>
        <CardDescription>{tDir("approveOrReturn")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 py-2">
        {selectedTeacher.approvedAt ? (
          <Alert variant="success" className="p-2.5">
            <ShieldCheck />
            <AlertTitle>{tDir("approvedSchedule")}</AlertTitle>
            <AlertDescription>{selectedTeacher.approvedAt}</AlertDescription>
          </Alert>
        ) : null}
        {selectedTeacher.reviewNote ? (
          <Alert variant="warning" className="p-2.5">
            <AlertCircle />
            <AlertTitle>{tDir("currentObservation")}</AlertTitle>
            <AlertDescription>{selectedTeacher.reviewNote}</AlertDescription>
          </Alert>
        ) : null}
        <Textarea
          aria-label={tDir("observationForFaculty")}
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder={tDir("observationPlaceholder")}
          size="sm"
          disabled={periodClosed}
          value={reviewNote}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={!canObserve}
            loading={saving}
            onClick={onObserveTeacher}
            variant="outline"
          >
            {tDir("observe")}
          </Button>
          <Button
            disabled={!canApprove}
            loading={saving}
            onClick={onApproveTeacher}
          >
            {tDir("approve")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditTrailCard({ events }: { events: ScheduleEvent[] }) {
  const locale = useLocale();
  const t = useTranslations("audit");
  const tEvents = useTranslations("events");
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="border-b px-3 py-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-gold" />
          {t("institutionalAudit")}
        </CardTitle>
        <CardDescription>{t("institutionalHistory")}</CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        {events.length ? (
          <ScrollArea scrollFade scrollbarGutter>
            <div className="grid gap-0.5 p-2">
              {events.slice(0, 12).map((event) => (
                <div
                  className="rounded-md border bg-muted/25 p-2 text-xs"
                  key={event.id}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {eventLabel(event.eventType, tEvents)}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatEventDate(event.createdAt, locale)}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {event.actorName}
                    {eventSummary(event, tEvents)
                      ? ` · ${eventSummary(event, tEvents)}`
                      : ""}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <Empty className="h-full py-8">
            <EmptyMedia variant="icon">
              <History />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>{t("noEvents")}</EmptyTitle>
              <EmptyDescription>{t("adjustSearchOrType")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function LockedDirectionView() {
  const _locale = useLocale();
  const t = useTranslations("direction");
  return (
    <section className="flex h-full items-center justify-center p-6">
      <Alert className="max-w-xl" variant="warning">
        <LockKeyhole />
        <AlertTitle>{t("restrictedRoute")}</AlertTitle>
        <AlertDescription>{t("restrictedDescription")}</AlertDescription>
        <AlertAction>
          <Link className={buttonVariants({ size: "sm" })} href="/teacher">
            {t("backToFaculty")}
          </Link>
        </AlertAction>
      </Alert>
    </section>
  );
}

function TeacherButton({
  index,
  onClick,
  selected,
  teacher,
}: {
  index: number;
  onClick: () => void;
  selected: boolean;
  teacher: TeacherProfile;
}) {
  const tStatus = useTranslations("status");
  return (
    <button
      className={cn(
        "flex h-[62px] w-full items-center justify-between gap-2 rounded-lg border px-2.5 text-left text-sm transition-colors",
        selected ? "border-primary bg-accent" : "bg-card hover:bg-accent/60",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="text-muted-foreground tabular-nums">{index + 1}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{teacher.name}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {teacherButtonMeta(teacher)}
          </span>
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={teacher.status === "enviado" ? "default" : "secondary"}>
          {contractRules[teacher.contract].short}
        </Badge>
        <span className="text-muted-foreground text-[11px]">
          {statusLabel(teacher.status, tStatus)}
        </span>
      </span>
    </button>
  );
}

function ScheduleBoard({
  availability,
  emptyDescription,
  emptyLabel,
  interactive = false,
  onToggleSlot,
}: {
  availability: string[];
  emptyDescription?: string;
  emptyLabel?: string;
  interactive?: boolean;
  onToggleSlot?: (day: DayKey, hour: number) => void;
}) {
  const selected = useMemo(() => new Set(availability), [availability]);
  const _tScheduleBoard = useTranslations("scheduleBoard");
  const tDays = useTranslations("days");
  const tMisc = useTranslations("misc");
  const tTeacher = useTranslations("teacher");
  const tPrint = useTranslations("print");
  const dayI18nKey: Record<DayKey, string> = {
    lunes: "monday",
    martes: "tuesday",
    miercoles: "wednesday",
    jueves: "thursday",
    viernes: "friday",
    sabado: "saturday",
  };

  return (
    <div className="relative h-[560px] overflow-hidden md:h-full">
      <div className="h-full overflow-y-auto p-2 md:hidden">
        <div className="grid gap-2">
          {days.map((day) => {
            const selectedCount = hours.filter((hour) =>
              selected.has(slotKey(day.key, hour)),
            ).length;
            return (
              <div
                className="overflow-hidden rounded-md border bg-card"
                key={day.key}
              >
                <div className="flex h-10 items-center justify-between border-b bg-primary px-3 text-primary-foreground">
                  <div className="font-medium">
                    {tDays(dayI18nKey[day.key])}
                  </div>
                  <Badge
                    variant="secondary"
                    className="bg-card text-card-foreground"
                  >
                    {selectedCount} h
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-1.5 p-2">
                  {hours.map((hour) => {
                    const key = slotKey(day.key, hour);
                    const isSelected = selected.has(key);
                    const Cell = interactive ? "button" : "div";
                    const label = `${tDays(dayI18nKey[day.key])} ${formatHour(hour)}: ${
                      isSelected
                        ? tTeacher("availabilityLabel")
                        : tMisc("unmarked")
                    }`;
                    return (
                      <Cell
                        aria-label={interactive ? label : undefined}
                        aria-pressed={interactive ? isSelected : undefined}
                        className={cn(
                          "flex h-9 items-center justify-between rounded-md border px-2 text-left text-xs transition-colors",
                          isSelected
                            ? "border-availability bg-availability text-white"
                            : "bg-muted/20 hover:bg-availability-muted",
                          interactive &&
                            "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        key={key}
                        onClick={
                          interactive
                            ? () => onToggleSlot?.(day.key, hour)
                            : undefined
                        }
                        type={interactive ? "button" : undefined}
                      >
                        <span className="tabular-nums">{formatHour(hour)}</span>
                        {isSelected ? <Check className="size-3.5" /> : null}
                      </Cell>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="hidden h-full overflow-x-auto overflow-y-hidden md:block">
        <div className="flex h-full min-w-[660px] flex-col">
          <div className="grid h-11 shrink-0 grid-cols-[92px_repeat(6,minmax(94px,1fr))] border-b bg-primary text-primary-foreground text-sm">
            <div className="flex items-center border-r px-3 font-medium">
              {tPrint("time")}
            </div>
            {days.map((day) => (
              <div
                className="flex items-center justify-center border-r px-3 font-medium last:border-r-0"
                key={day.key}
              >
                {tDays(dayI18nKey[day.key])}
              </div>
            ))}
          </div>
          <div className="grid min-h-0 flex-1 grid-rows-[repeat(14,minmax(0,1fr))]">
            {hours.map((hour) => (
              <div
                className="grid min-h-0 grid-cols-[92px_repeat(6,minmax(94px,1fr))] border-b last:border-b-0"
                key={hour}
              >
                <div className="flex items-center justify-center border-r bg-muted/55 px-1.5 text-center font-medium text-[11px] tabular-nums leading-tight">
                  {formatHour(hour)}
                </div>
                {days.map((day) => {
                  const key = slotKey(day.key, hour);
                  const isSelected = selected.has(key);
                  const Cell = interactive ? "button" : "div";
                  const label = `${tDays(dayI18nKey[day.key])} ${formatHour(hour)}: ${
                    isSelected
                      ? tTeacher("availabilityLabel")
                      : tMisc("unmarked")
                  }`;
                  return (
                    <Cell
                      aria-label={interactive ? label : undefined}
                      aria-pressed={interactive ? isSelected : undefined}
                      className={cn(
                        "flex min-h-0 items-center justify-center border-r text-xs transition-colors last:border-r-0",
                        isSelected
                          ? "bg-availability text-white"
                          : "bg-card hover:bg-availability-muted",
                        interactive &&
                          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      )}
                      key={key}
                      onClick={
                        interactive
                          ? () => onToggleSlot?.(day.key, hour)
                          : undefined
                      }
                      type={interactive ? "button" : undefined}
                    >
                      {isSelected ? <Check className="size-4" /> : null}
                    </Cell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {!interactive && emptyLabel && availability.length === 0 ? (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-lg border bg-card/92 p-3 text-center shadow-sm backdrop-blur">
          <div className="font-medium">{emptyLabel}</div>
          {emptyDescription ? (
            <div className="mt-1 text-muted-foreground text-xs">
              {emptyDescription}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function RulePanel({
  profile,
  validation,
}: {
  profile: TeacherProfile;
  validation: Validation;
}) {
  const _locale = useLocale();
  const tMisc = useTranslations("misc");
  const tTeacher = useTranslations("teacher");
  const tRules = useTranslations("ruleMessages");
  const tContracts = useTranslations("contracts");
  const rule = contractRules[profile.contract];
  const rows = [
    {
      label: tMisc("minimumHours"),
      complete: validation.selectedHours >= rule.requiredHours,
      value: `${validation.selectedHours}/${rule.requiredHours}`,
    },
    {
      label: tTeacher("validDays"),
      complete: validation.blockDays >= rule.requiredBlockDays,
      value: `${validation.blockDays}/${rule.requiredBlockDays}`,
    },
    {
      label: tTeacher("courses"),
      complete:
        validation.countedCourses <= rule.maxCourses &&
        validation.countedCourses > 0,
      value: `${validation.countedCourses}/${rule.maxCourses}`,
    },
  ];

  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="space-y-0 px-3 py-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4 text-gold" />
          {tMisc("activeRules")}
        </CardTitle>
        <CardDescription>
          {tContracts(
            contractRules[profile.contract].text.slice("contracts.".length),
          )}
        </CardDescription>
        {!validation.complete ? (
          <CardDescription className="text-warning">
            {scheduleCorrectionMessage(profile, validation, tRules)}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-3 pb-2 pt-0 text-sm">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-3"
            key={row.label}
          >
            <span className="text-muted-foreground">{row.label}</span>
            <Badge variant={row.complete ? "default" : "secondary"}>
              {row.value}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function CourseCardsList({
  courses,
  emptyDescription,
  emptyTitle,
  onRemoveCourse,
  removeDisabled = false,
}: {
  courses: Course[];
  emptyDescription?: string;
  emptyTitle?: string;
  onRemoveCourse?: (id: string) => void;
  removeDisabled?: boolean;
}) {
  const tCourseEditor = useTranslations("courseEditor");
  const tCatalog = useTranslations("catalog");
  const resolvedEmptyTitle = emptyTitle ?? tCourseEditor("noCourses");
  const resolvedEmptyDescription =
    emptyDescription ?? tCourseEditor("addCourseToEnableValidation");
  if (!courses.length) {
    return (
      <Empty className="h-full px-3 py-8">
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{resolvedEmptyTitle}</EmptyTitle>
          <EmptyDescription>{resolvedEmptyDescription}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    );
  }

  return (
    <ScrollArea scrollbarGutter scrollFade>
      <div className="grid gap-1.5 p-1.5">
        {courses.map((course, index) => (
          <div
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 rounded-md border bg-card px-2.5 py-2 shadow-xs"
            key={course.id}
          >
            <span className="flex size-7 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground text-xs tabular-nums">
              {index + 1}
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {course.name}
                </span>
                {course.isThesis ? (
                  <Badge variant="secondary" className="shrink-0">
                    {tCatalog("thesis")}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-muted-foreground text-xs">
                {courseMeta(course, tCatalog)}
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-muted-foreground text-xs">
                <GraduationCap className="size-3.5 shrink-0" />
                <span className="truncate">{course.school}</span>
              </div>
            </div>
            {onRemoveCourse ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      disabled={removeDisabled}
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => onRemoveCourse(course.id)}
                    />
                  }
                >
                  <Trash2 data-icon="inline-start" />
                  <span className="sr-only">
                    {tCourseEditor("removeCourse")}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{tCourseEditor("removeCourse")}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function completionFor(profile: TeacherProfile, validation: Validation) {
  return completionForRules(profile, validation);
}

function scheduleCorrectionMessage(
  profile: Pick<TeacherProfile, "contract">,
  validation: Validation,
  t: (key: string, params?: Record<string, string | number | Date>) => string,
) {
  const rule = contractRules[profile.contract];
  if (validation.blockDays < rule.requiredBlockDays) {
    const missingDays = rule.requiredBlockDays - validation.blockDays;
    const missingHours = rule.requiredHours - validation.selectedHours;
    const tooManyCourses = validation.countedCourses > rule.maxCourses;
    const noCourse = validation.countedCourses <= 0;
    if (missingHours > 0 && noCourse && tooManyCourses) {
      return t("allIncomplete", {
        days: missingDays,
        hours: missingHours,
        max: rule.maxCourses,
      });
    }
    if (missingHours > 0 && tooManyCourses) {
      return t("missingHoursReduceCourses", {
        hours: missingHours,
        max: rule.maxCourses,
      });
    }
    if (tooManyCourses) {
      return t("missingValidDayReduceCourses", {
        days: missingDays,
        max: rule.maxCourses,
      });
    }
    if (missingHours > 0) {
      return t("missingValidDayAndHours", {
        days: missingDays,
        hours: missingHours,
      });
    }
    return t("missingValidDay", { count: missingDays });
  }
  if (validation.selectedHours < rule.requiredHours) {
    const missing = rule.requiredHours - validation.selectedHours;
    return t("missingHours", { count: missing });
  }
  if (validation.countedCourses <= 0) {
    return t("courseEditor.selectNonThesis");
  }
  if (validation.countedCourses > rule.maxCourses) {
    return t("reduceNonThesisCourses", { max: rule.maxCourses });
  }
  return t("rulesStillIncomplete");
}

function countTeachersByStatus(
  teachers: TeacherProfile[],
): TeacherStatusCounts {
  return teachers.reduce<TeacherStatusCounts>(
    (counts, teacher) => {
      counts[teacher.status] += 1;
      return counts;
    },
    { aprobado: 0, borrador: 0, enviado: 0, observado: 0 },
  );
}

function filterTeachers(
  teachers: TeacherProfile[],
  {
    query,
    showOnlyPending,
    statusFilter,
    t,
    tContracts,
  }: {
    query: string;
    showOnlyPending: boolean;
    statusFilter: TeacherStatusFilter;
    t?: (key: string) => string;
    tContracts?: (key: string) => string;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  return teachers.filter((teacher) => {
    if (showOnlyPending && teacher.status === "aprobado") {
      return false;
    }
    if (statusFilter !== "all" && teacher.status !== statusFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [
      teacher.name,
      teacher.email,
      statusLabel(teacher.status, t),
      tContracts
        ? tContracts(
            contractRules[teacher.contract].label.slice("contracts.".length),
          )
        : contractRules[teacher.contract].short,
      contractRules[teacher.contract].short,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function filterUsers(
  users: ScheduleUser[],
  {
    onboardingFilter,
    query,
    roleFilter,
    t,
    tRole,
    tUsers,
  }: {
    onboardingFilter: UserOnboardingFilter;
    query: string;
    roleFilter: UserRoleFilter;
    t?: (key: string) => string;
    tRole?: (key: string) => string;
    tUsers?: (key: string) => string;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  return users.filter((user) => {
    if (roleFilter !== "all" && user.role !== roleFilter) {
      return false;
    }
    if (onboardingFilter === "complete" && user.onboardingComplete === false) {
      return false;
    }
    if (onboardingFilter === "pending" && user.onboardingComplete) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [
      user.name,
      user.email,
      roleLabel(user.role, tRole),
      user.school,
      user.teacherCode ?? "",
      user.teacherCategory ?? "",
      user.academicDegree ?? "",
      user.teacherStatus
        ? statusLabel(user.teacherStatus, t)
        : tUsers
          ? tUsers("noSignIn")
          : "No aplica",
      user.onboardingComplete
        ? tUsers
          ? tUsers("hasSignedIn")
          : "Ingresó"
        : tUsers
          ? tUsers("noSignIn")
          : "Sin ingreso",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function filterCourses(
  courses: Course[],
  {
    query,
    schoolFilter,
    statusFilter,
    tCatalog,
  }: {
    query: string;
    schoolFilter: string;
    statusFilter: CourseStatusFilter;
    tCatalog?: (key: string) => string;
  },
) {
  const normalizedQuery = query.trim().toLowerCase();
  return courses.filter((course) => {
    const active = course.active !== false;
    if (statusFilter === "active" && !active) {
      return false;
    }
    if (statusFilter === "suspended" && active) {
      return false;
    }
    if (schoolFilter !== "all" && course.school !== schoolFilter) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return [
      course.id,
      course.code,
      course.name,
      course.school,
      course.cycle
        ? `${tCatalog ? tCatalog("cycle") : "Ciclo"} ${course.cycle}`
        : "",
      course.credits
        ? `${course.credits} ${tCatalog ? tCatalog("credits") : "créditos"}`
        : "",
      active
        ? tCatalog
          ? tCatalog("activeLabel")
          : "Activo"
        : tCatalog
          ? tCatalog("suspendedLabel")
          : "Suspendido",
      course.isThesis ? (tCatalog ? tCatalog("thesis") : "Tesis") : "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function courseLabel(course: Course) {
  return course.code ? `${course.code} · ${course.name}` : course.name;
}

function courseMeta(course: Course, tCatalog?: (key: string) => string) {
  return [
    course.code,
    course.cycle
      ? `${tCatalog ? tCatalog("cycle") : "Ciclo"} ${course.cycle}`
      : "",
    course.credits
      ? `${course.credits} ${tCatalog ? tCatalog("crShort") : "cr."}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function teacherButtonMeta(teacher: TeacherProfile) {
  return [teacher.teacherCode, teacher.department, teacher.email]
    .filter(Boolean)
    .join(" · ");
}

function teacherProfileSummary(
  teacher: TeacherProfile,
  tContracts?: (key: string) => string,
  tStatus?: (key: string) => string,
  tMisc?: (key: string) => string,
) {
  return [
    tContracts
      ? tContracts(
          contractRules[teacher.contract].label.slice("contracts.".length),
        )
      : contractRules[teacher.contract].short,
    statusLabel(teacher.status, tStatus),
    teacher.teacherCode
      ? `${tMisc ? tMisc("codigo") : "Código"} ${teacher.teacherCode}`
      : "",
    teacher.department,
    teacher.category,
    teacher.academicDegree,
  ]
    .filter(Boolean)
    .join(" · ");
}

function statusLabel(
  status: TeacherProfile["status"],
  t?: (key: string) => string,
) {
  if (status === "aprobado") {
    return t ? t("approved") : "Aprobado";
  }
  if (status === "enviado") {
    return t ? t("submitted") : "Enviado";
  }
  if (status === "observado") {
    return t ? t("observed") : "Observado";
  }
  return t ? t("draft") : "Borrador";
}

function roleLabel(role: AppRole, t?: (key: string) => string) {
  if (role === "admin") {
    return t ? t("adminLabel") : "Admin";
  }
  return role === "direccion"
    ? t
      ? t("directionLabel")
      : "Dirección"
    : t
      ? t("docenteLabel")
      : "Docente";
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "U"
  );
}

function routeLabel(view: ViewKey, t?: (key: string) => string) {
  if (view === "configuracion") {
    return t ? t("settings") : "Configuración";
  }
  if (view === "usuarios") {
    return t ? t("users") : "Usuarios";
  }
  if (view === "auditoria") {
    return t ? t("audit") : "Auditoría";
  }
  return view === "direccion"
    ? t
      ? t("direction")
      : "Dirección"
    : t
      ? t("teacher")
      : "Docente";
}

function eventLabel(eventType: string, t?: (key: string) => string) {
  const keys: Record<string, string> = {
    "director.approved_schedule": "scheduleApproved",
    "director.course_assigned": "courseAssigned",
    "director.course_imported": "teachingLoadImported",
    "director.course_unassigned": "courseRemoved",
    "director.observed_schedule": "scheduleSubmitted",
    "period.closed": "periodClosed",
    "period.reopened": "periodReopened",
    "teacher.availability_changed": "availabilityUpdated",
    "teacher.contract_changed": "teachingCategoryChanged",
    "teacher.course_added": "courseAdded",
    "teacher.course_removed": "courseRemoved",
    "teacher.submitted_schedule": "scheduleSubmitted",
    "onboarding.completed": "profileConfigured",
    "access.user_updated": "accessUpdated",
    "catalog.course_status_changed": "courseStatusUpdated",
    "catalog.course_upserted": "courseSaved",
  };
  const key = keys[eventType];
  if (t && key) {
    return t(key);
  }
  const fallback: Record<string, string> = {
    "director.approved_schedule": "Horario aprobado",
    "director.course_assigned": "Curso asignado",
    "director.course_imported": "Carga docente importada",
    "director.course_unassigned": "Curso retirado",
    "director.observed_schedule": "Observación registrada",
    "period.closed": "Periodo cerrado",
    "period.reopened": "Periodo reabierto",
    "teacher.availability_changed": "Disponibilidad actualizada",
    "teacher.contract_changed": "Clase docente cambiada",
    "teacher.course_added": "Curso agregado",
    "teacher.course_removed": "Curso retirado",
    "teacher.submitted_schedule": "Horario enviado",
    "onboarding.completed": "Perfil configurado",
    "access.user_updated": "Acceso actualizado",
    "catalog.course_status_changed": "Estado de curso actualizado",
    "catalog.course_upserted": "Curso guardado",
  };
  return fallback[eventType] ?? eventType;
}

function eventScopeLabel(eventType: string, t?: (key: string) => string) {
  if (eventType.startsWith("teacher.")) {
    return t ? t("schedule") : "Horario";
  }
  if (eventType.startsWith("director.")) {
    return t ? t("roster") : "Padrón";
  }
  if (eventType.startsWith("catalog.")) {
    return t ? t("catalog") : "Catálogo";
  }
  if (eventType.startsWith("access.")) {
    return t ? t("accesses") : "Accesos";
  }
  if (eventType.startsWith("settings.") || eventType.startsWith("period.")) {
    return t ? t("period") : "Periodo";
  }
  if (eventType.startsWith("onboarding.")) {
    return t ? t("user") : "Usuario";
  }
  return t ? t("system") : "Sistema";
}

function eventSummary(event: ScheduleEvent, t?: (key: string) => string) {
  if (typeof event.metadata.note === "string") {
    return event.metadata.note;
  }
  if (typeof event.metadata.submittedAt === "string") {
    return event.metadata.submittedAt;
  }
  if (typeof event.metadata.approvedAt === "string") {
    return event.metadata.approvedAt;
  }
  if (typeof event.metadata.closedAt === "string") {
    return event.metadata.closedAt;
  }
  if (typeof event.metadata.name === "string") {
    const school =
      typeof event.metadata.school === "string" ? event.metadata.school : "";
    return [event.metadata.name, school].filter(Boolean).join(" · ");
  }
  if (typeof event.metadata.active === "boolean") {
    return event.metadata.active
      ? t
        ? t("courseActive")
        : "Curso activo"
      : t
        ? t("courseSuspended")
        : "Curso suspendido";
  }
  if (typeof event.metadata.contract === "string") {
    return contractRules[event.metadata.contract as ContractKey]?.short;
  }
  if (typeof event.metadata.slots === "number") {
    return `${event.metadata.slots} ${t ? t("markedBlocks") : "bloques marcados"}`;
  }
  if (typeof event.metadata.courseId === "string") {
    const name =
      typeof event.metadata.courseName === "string"
        ? event.metadata.courseName
        : "";
    return [name, event.metadata.courseId].filter(Boolean).join(" · ");
  }
  if (typeof event.metadata.importedCourses === "number") {
    return `${event.metadata.importedCourses} ${t ? t("events.importedCourses") : "cursos importados"}`;
  }
  return "";
}

function formatEventDate(value: string, locale: string = "es") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function intlLocale(locale: string) {
  const localesByAppLocale: Record<string, string> = {
    en: "en-US",
    es: "es-PE",
    "zh-CN": "zh-CN",
    "zh-TW": "zh-TW",
  };
  return localesByAppLocale[locale];
}

function exportAuditCsv(
  events: ScheduleEvent[],
  locale: string,
  t: (key: string) => string,
  tEvents: (key: string) => string,
) {
  const rows = [
    [t("date"), t("event"), t("type"), t("actor"), t("reference"), t("detail")],
    ...events.map((event) => [
      formatEventDate(event.createdAt, locale),
      eventLabel(event.eventType, tEvents),
      event.eventType,
      event.actorName,
      event.teacherId,
      eventSummary(event, tEvents),
    ]),
  ];
  const csv = rows
    .map((row) => row.map((cell) => escapeCsvCell(cell)).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "auditoria-horarios-unmsm.csv";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function escapeCsvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function exportXlsx(
  profile: TeacherProfile,
  validation: Validation,
  academicTerm: string,
  locale: string,
  t: (key: string) => string,
  tMisc?: (key: string) => string,
  tDays?: (key: string) => string,
) {
  const XLSX = await import("xlsx");
  const { rows, merges, rowHeights } = buildPrintedScheduleSheetRows(
    profile,
    validation,
    academicTerm,
    locale,
    t,
    tMisc,
    tDays,
  );
  const worksheet = XLSX.utils.aoa_to_sheet(rows) as XlsxWorksheet;
  worksheet["!merges"] = merges;
  worksheet["!cols"] = [
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
    { wch: 16 },
  ];
  worksheet["!rows"] = rowHeights.map((hpt) => ({ hpt }));
  worksheet["!margins"] = {
    bottom: 0.25,
    footer: 0.1,
    header: 0.1,
    left: 0.25,
    right: 0.25,
    top: 0.25,
  };
  worksheet["!pageSetup"] = {
    fitToHeight: 1,
    fitToPage: true,
    fitToWidth: 1,
    orientation: "portrait",
    paperSize: 9,
  };
  stylePrintedScheduleWorksheet(worksheet);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    t("print.sheetName").slice(0, 31),
  );
  XLSX.writeFile(workbook, `${printedScheduleFileName(profile)}.xlsx`, {
    cellStyles: true,
  });
}

async function exportPdf(
  profile: TeacherProfile,
  _validation: Validation,
  academicTerm: string,
  locale: string,
  t: (key: string) => string,
  tMisc?: (key: string) => string,
  tDays?: (key: string) => string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = createPrintedScheduleDocument(jsPDF);
  drawPrintedSchedulePage(doc, profile, academicTerm, locale, t, tMisc, tDays);
  doc.save(`${printedScheduleFileName(profile)}.pdf`);
}

async function exportAllPdf(
  profiles: TeacherProfile[],
  academicTerm: string,
  locale: string,
  t: (key: string) => string,
  tMisc?: (key: string) => string,
  tDays?: (key: string) => string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = createPrintedScheduleDocument(jsPDF);
  profiles.forEach((profile, index) => {
    if (index > 0) {
      doc.addPage("a4", "portrait");
    }
    drawPrintedSchedulePage(
      doc,
      profile,
      academicTerm,
      locale,
      t,
      tMisc,
      tDays,
    );
  });
  doc.save(printedScheduleBundleFileName(academicTerm));
}

type JsPdfConstructor = typeof import("jspdf").jsPDF;
type JsPdfDocument = InstanceType<JsPdfConstructor>;

function createPrintedScheduleDocument(jsPDF: JsPdfConstructor) {
  return new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
}

function drawPrintedSchedulePage(
  doc: JsPdfDocument,
  profile: TeacherProfile,
  academicTerm: string,
  _locale: string,
  t: (key: string) => string,
  tMisc?: (key: string) => string,
  tDays?: (key: string) => string,
) {
  const selected = new Set(profile.availability);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const tableWidth = pageWidth - margin * 2;
  const sectionFill: [number, number, number] = [232, 236, 226];
  const thinFill: [number, number, number] = [244, 246, 241];
  let y = 10;

  doc.setLineWidth(0.25);

  const setFont = (fontSize: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(fontSize);
  };

  const drawCell = (
    x: number,
    cellY: number,
    width: number,
    height: number,
    value: string,
    options: {
      align?: "left" | "center" | "right";
      bold?: boolean;
      fill?: [number, number, number];
      fontSize?: number;
      padding?: number;
    } = {},
  ) => {
    const padding = options.padding ?? 1.5;
    if (options.fill) {
      doc.setFillColor(...options.fill);
      doc.rect(x, cellY, width, height, "FD");
    } else {
      doc.rect(x, cellY, width, height);
    }
    setFont(options.fontSize ?? 8, options.bold);
    const align = options.align ?? "left";
    const textX =
      align === "center"
        ? x + width / 2
        : align === "right"
          ? x + width - padding
          : x + padding;
    const lines = doc.splitTextToSize(value, width - padding * 2);
    const visibleLines = Array.isArray(lines) ? lines.slice(0, 3) : [value];
    const lineHeight = (options.fontSize ?? 8) * 0.35;
    const totalTextHeight = Math.max(visibleLines.length - 1, 0) * lineHeight;
    const textY = cellY + height / 2 - totalTextHeight / 2 + 1.05;
    doc.text(visibleLines, textX, textY, { align });
  };

  drawCell(margin, y, tableWidth, 19, t("print.universityHeader"), {
    align: "center",
    bold: true,
    fontSize: 7.6,
    padding: 2,
  });
  y += 21;

  drawCell(margin, y, tableWidth, 5.5, t("print.generalData"), {
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 5.5;
  drawCell(margin, y, tableWidth * 0.7, 7, `${t("names")}: ${profile.name}`, {
    fontSize: 8,
  });
  drawCell(
    margin + tableWidth * 0.7,
    y,
    tableWidth * 0.3,
    7,
    `${t("code")}: ${profile.teacherCode ?? "-"}`,
    { fontSize: 8 },
  );
  y += 10;

  drawCell(margin, y, tableWidth, 5.5, t("print.availability"), {
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 5.5;
  const availabilityColumnWidth = tableWidth / 4;
  [
    t("print.term"),
    "",
    t("print.date"),
    "",
    t("print.category"),
    "",
    t("print.hours"),
  ].forEach((label, index) => {
    drawCell(
      margin + availabilityColumnWidth * index,
      y,
      availabilityColumnWidth,
      6,
      label,
      { align: "center", bold: true, fill: thinFill, fontSize: 8 },
    );
  });
  y += 6;
  [
    academicTerm,
    printedScheduleDate(profile),
    printedCategory(profile, undefined, tMisc),
    String(contractRules[profile.contract].requiredHours),
  ].forEach((value, index) => {
    drawCell(
      margin + availabilityColumnWidth * index,
      y,
      availabilityColumnWidth,
      7,
      value,
      { align: "center", bold: true, fontSize: 7.6 },
    );
  });
  y += 11;

  drawCell(margin, y, tableWidth, 6, t("print.availabilitySchedule"), {
    align: "center",
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 6;
  const hourColumnWidth = 30;
  const dayColumnWidth = (tableWidth - hourColumnWidth) / days.length;
  const scheduleRowHeight = 8.3;
  drawCell(margin, y, hourColumnWidth, 7, t("print.time"), {
    align: "center",
    bold: true,
    fill: thinFill,
    fontSize: 8,
  });
  days.forEach((day, index) => {
    drawCell(
      margin + hourColumnWidth + dayColumnWidth * index,
      y,
      dayColumnWidth,
      7,
      localizedDayLabel(day.label, tDays),
      { align: "center", bold: true, fill: thinFill, fontSize: 8 },
    );
  });
  y += 7;
  hours.forEach((hour) => {
    drawCell(margin, y, hourColumnWidth, scheduleRowHeight, formatHour(hour), {
      align: "center",
      fontSize: 7.4,
    });
    days.forEach((day, index) => {
      drawCell(
        margin + hourColumnWidth + dayColumnWidth * index,
        y,
        dayColumnWidth,
        scheduleRowHeight,
        selected.has(slotKey(day.key, hour)) ? "X" : "",
        { align: "center", fontSize: 9 },
      );
    });
    y += scheduleRowHeight;
  });
  y += 5;

  drawCell(margin, y, tableWidth, 6, t("print.coursesToTeach"), {
    align: "center",
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 6;
  const courseColumnWidth = tableWidth * 0.53;
  const schoolColumnWidth = tableWidth - courseColumnWidth;
  drawCell(margin, y, courseColumnWidth, 6, t("print.course"), {
    bold: true,
    fill: thinFill,
    fontSize: 8,
  });
  drawCell(
    margin + courseColumnWidth,
    y,
    schoolColumnWidth,
    6,
    t("print.school"),
    {
      bold: true,
      fill: thinFill,
      fontSize: 8,
    },
  );
  y += 6;
  const courseRows = Math.max(4, profile.courses.length);
  const availableCourseHeight = pageHeight - y - 11;
  const courseRowHeight = Math.max(
    5.8,
    Math.min(8, availableCourseHeight / courseRows),
  );
  Array.from({ length: courseRows }).forEach((_, index) => {
    const course = profile.courses[index];
    drawCell(
      margin,
      y,
      courseColumnWidth,
      courseRowHeight,
      course?.name ?? "",
      {
        fontSize: 7.6,
      },
    );
    drawCell(
      margin + courseColumnWidth,
      y,
      schoolColumnWidth,
      courseRowHeight,
      course ? institutionalUpper(course.school) : "",
      { fontSize: 7.6 },
    );
    y += courseRowHeight;
  });
}

type XlsxMerge = {
  s: { r: number; c: number };
  e: { r: number; c: number };
};

type XlsxCell = {
  s?: Record<string, unknown>;
};

type XlsxWorksheet = Record<string, unknown> & {
  "!cols"?: { wch: number }[];
  "!margins"?: Record<string, number>;
  "!merges"?: XlsxMerge[];
  "!pageSetup"?: Record<string, unknown>;
  "!rows"?: { hpt: number }[];
};

function buildPrintedScheduleSheetRows(
  profile: TeacherProfile,
  validation: Validation,
  academicTerm: string,
  _locale: string,
  t: (key: string) => string,
  tMisc?: (key: string) => string,
  tDays?: (key: string) => string,
) {
  const selected = new Set(profile.availability);
  const rows: (string | number)[][] = [];
  const merges: XlsxMerge[] = [];
  const rowHeights: number[] = [];
  const addRow = (values: (string | number)[], height = 18) => {
    rows.push([
      ...values,
      ...Array.from({ length: 7 - values.length }, () => ""),
    ]);
    rowHeights.push(height);
    return rows.length - 1;
  };
  const merge = (
    startRow: number,
    startColumn: number,
    endRow: number,
    endColumn: number,
  ) => {
    merges.push({
      e: { c: endColumn, r: endRow },
      s: { c: startColumn, r: startRow },
    });
  };

  const titleRow = addRow([t("print.universityHeader")], 54);
  merge(titleRow, 0, titleRow, 6);

  const generalHeader = addRow([t("print.generalData")], 18);
  merge(generalHeader, 0, generalHeader, 6);
  const generalRow = addRow(
    [
      `${t("print.names")}: ${profile.name}`,
      "",
      "",
      "",
      "",
      `${t("print.code")}: ${profile.teacherCode ?? "-"}`,
    ],
    20,
  );
  merge(generalRow, 0, generalRow, 4);
  merge(generalRow, 5, generalRow, 6);

  const availabilityHeader = addRow([t("print.availability")], 18);
  merge(availabilityHeader, 0, availabilityHeader, 6);
  const availabilityLabels = addRow(
    [
      t("print.term"),
      "",
      t("print.date"),
      "",
      t("print.category"),
      "",
      t("print.hours"),
    ],
    20,
  );
  merge(availabilityLabels, 0, availabilityLabels, 1);
  merge(availabilityLabels, 2, availabilityLabels, 3);
  merge(availabilityLabels, 4, availabilityLabels, 5);
  const availabilityValues = addRow(
    [
      academicTerm,
      "",
      printedScheduleDate(profile),
      "",
      printedCategory(profile, undefined, tMisc),
      "",
      contractRules[profile.contract].requiredHours,
    ],
    22,
  );
  merge(availabilityValues, 0, availabilityValues, 1);
  merge(availabilityValues, 2, availabilityValues, 3);
  merge(availabilityValues, 4, availabilityValues, 5);

  const scheduleHeader = addRow([t("print.availabilitySchedule")], 18);
  merge(scheduleHeader, 0, scheduleHeader, 6);
  addRow(
    [
      t("print.time"),
      ...days.map((day) => localizedDayLabel(day.label, tDays)),
    ],
    20,
  );
  hours.forEach((hour) => {
    addRow(
      [
        formatHour(hour),
        ...days.map((day) => (selected.has(slotKey(day.key, hour)) ? "X" : "")),
      ],
      21,
    );
  });

  const coursesHeader = addRow([t("print.coursesToTeach")], 18);
  merge(coursesHeader, 0, coursesHeader, 6);
  const courseLabels = addRow(
    [t("print.course"), "", "", "", t("print.school")],
    20,
  );
  merge(courseLabels, 0, courseLabels, 3);
  merge(courseLabels, 4, courseLabels, 6);
  Array.from({ length: Math.max(4, profile.courses.length) }).forEach(
    (_, index) => {
      const course = profile.courses[index];
      const row = addRow(
        [
          course?.name ?? "",
          "",
          "",
          "",
          course ? institutionalUpper(course.school) : "",
        ],
        21,
      );
      merge(row, 0, row, 3);
      merge(row, 4, row, 6);
    },
  );

  const summaryRow = addRow(
    [
      `${t("print.markedHours")}: ${validation.selectedHours} / ${contractRules[profile.contract].requiredHours}`,
      "",
      `${t("print.blocks")}: ${validation.blockDays}`,
      "",
      `${t("print.course")}: ${validation.countedCourses}`,
    ],
    18,
  );
  merge(summaryRow, 0, summaryRow, 1);
  merge(summaryRow, 2, summaryRow, 3);
  merge(summaryRow, 4, summaryRow, 6);

  return { merges, rowHeights, rows };
}

function stylePrintedScheduleWorksheet(worksheet: XlsxWorksheet) {
  const ref = String(worksheet["!ref"] ?? "");
  const range = parseXlsxRef(ref);
  if (!range) {
    return;
  }
  const border = {
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
    top: { style: "thin" },
  };
  for (let row = 0; row <= range.endRow; row += 1) {
    for (let column = 0; column <= range.endColumn; column += 1) {
      const address = xlsxAddress(row, column);
      const cell = worksheet[address] as XlsxCell | undefined;
      if (!cell) {
        continue;
      }
      cell.s = {
        alignment: {
          horizontal: column === 0 ? "left" : "center",
          vertical: "center",
          wrapText: true,
        },
        border,
        font: { name: "Arial", sz: 9 },
      };
    }
  }
  [0, 1, 3, 6, 22].forEach((row) => {
    for (let column = 0; column <= range.endColumn; column += 1) {
      const cell = worksheet[xlsxAddress(row, column)] as XlsxCell | undefined;
      if (cell) {
        cell.s = {
          ...(cell.s ?? {}),
          alignment: {
            horizontal: "center",
            vertical: "center",
            wrapText: true,
          },
          fill: { fgColor: { rgb: "E8ECE2" }, patternType: "solid" },
          font: { bold: true, name: "Arial", sz: row === 0 ? 9 : 10 },
        };
      }
    }
  });
}

function parseXlsxRef(ref: string) {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(ref);
  if (!match) {
    return null;
  }
  return {
    endColumn: xlsxColumnIndex(match[3]),
    endRow: Number(match[4]) - 1,
  };
}

function xlsxColumnIndex(column: string) {
  return (
    column.split("").reduce((total, char) => {
      return total * 26 + char.charCodeAt(0) - 64;
    }, 0) - 1
  );
}

function xlsxAddress(row: number, column: number) {
  let value = column + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return `${label}${row + 1}`;
}

function printedScheduleDate(profile: TeacherProfile) {
  return formatPrintDate(profile.submittedAt ?? profile.updatedAt);
}

function formatPrintDate(value?: string) {
  if (!value) {
    return formatPrintDateValue(new Date());
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return formatPrintDateValue(date);
}

function formatPrintDateValue(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "America/Lima",
    year: "numeric",
  }).format(date);
}

function localizedDayLabel(label: string, tDays?: (key: string) => string) {
  const keyName = label.startsWith("days.")
    ? label.slice("days.".length)
    : label;
  return (tDays ?? ((k: string) => k))(keyName);
}

function printedCategory(
  profile: TeacherProfile,
  _t?: (key: string) => string,
  tMisc?: (key: string) => string,
) {
  const category = profile.category?.trim();
  const categoryLabel = category
    ? (teacherCategoryLabels[category.toUpperCase()] ?? category)
    : tMisc
      ? tMisc("noCategory")
      : "Sin categoría";
  const rule = contractRules[profile.contract];
  return `${categoryLabel} ${rule.short} ${rule.requiredHours}hrs.`;
}

const teacherCategoryLabels: Record<string, string> = {
  "1-PRI": "Principal",
  "2-ASO": "Asociado",
  "3-AUX": "Auxiliar",
};

function institutionalUpper(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^Ing\. de /i, "Ingenieria de ")
    .toUpperCase();
}

function printedScheduleFileName(profile: TeacherProfile) {
  const name = profile.name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `disponibilidad-docente-${name || "unmsm"}`;
}

function printedScheduleBundleFileName(academicTerm: string) {
  const term = academicTerm
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return `disponibilidades-docentes-${term || "unmsm"}.pdf`;
}

export function LocalizedSignedOutShell() {
  const tAuth = useTranslations("auth");
  const _tLanding = useTranslations("landing");
  const tMisc = useTranslations("misc");
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background p-3 text-foreground md:p-6">
      <section className="grid h-full max-h-[620px] w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-sm md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col justify-between bg-sidebar p-6 text-sidebar-foreground md:p-8">
          <div className="flex items-center gap-3">
            <Image
              src="/escudo-unmsm.png"
              alt={tMisc("escudoAlt")}
              width={56}
              height={56}
              className="rounded-md bg-vellum p-1"
              priority
            />
            <div className="min-w-0">
              <p className="text-gold text-xs font-semibold uppercase tracking-[0.18em]">
                UNMSM
              </p>
              <h1 className="truncate font-serif text-3xl font-semibold">
                {tMisc("horariosFisi")}
              </h1>
            </div>
          </div>
          <div className="max-w-xl space-y-4">
            <p className="font-serif text-3xl leading-tight md:text-4xl">
              {tAuth("landingTitle")}
            </p>
            <p className="max-w-lg text-sidebar-foreground/75 text-sm leading-6">
              {tAuth("landingDescription")}
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            {[
              tAuth("statsFaculty"),
              tAuth("statsDirection"),
              tAuth("statsSemester"),
            ].map((item) => (
              <div className="border-sidebar-border border-t pt-2" key={item}>
                <span className="text-sidebar-foreground/70">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 items-center bg-card p-5 md:p-6">
          <div className="w-full space-y-5">
            <LanguageSwitcher className="justify-end" />
            <div className="space-y-1">
              <Badge variant="secondary">{tAuth("accessBadge")}</Badge>
              <h2 className="font-serif text-2xl font-semibold">
                {tAuth("signInTitle")}
              </h2>
              <p className="text-muted-foreground text-sm leading-6">
                {tAuth("signInDescription")}
              </p>
            </div>
            <SignInButton mode="modal">
              <Button className="h-11 w-full">
                <GraduationCap data-icon="inline-start" />
                {tAuth("signInButton")}
              </Button>
            </SignInButton>
            <p className="border-t pt-3 text-muted-foreground text-xs leading-5">
              {tAuth("support")}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
