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
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import { visibleCoursesForSchool } from "@/lib/schedule-courses";
import {
  type ContractKey,
  type Course,
  contractRules,
  courseCatalog,
  type DayKey,
  days,
  formatHour,
  hours,
  schools,
  slotKey,
  type TeacherProfile,
} from "@/lib/schedule-data";
import type {
  AppRole,
  Onboarding,
  ScheduleEvent,
  SchedulePayload,
  ScheduleUser,
  TeacherCourseImportResponse,
} from "@/lib/schedule-db";
import {
  completionForRules,
  courseAssignmentState,
  type ScheduleValidation,
  validateTeacherRules,
} from "@/lib/schedule-rules";
import { cn } from "@/lib/utils";

type ViewKey =
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

type ScheduleAction =
  | { action: "setContract"; contract: ContractKey }
  | { action: "setAvailability"; availability: string[] }
  | { action: "addCourse"; courseId: string }
  | { action: "removeCourse"; courseId: string }
  | { action: "assignTeacherCourse"; teacherId: string; courseId: string }
  | { action: "unassignTeacherCourse"; teacherId: string; courseId: string }
  | { action: "observe"; teacherId: string; note: string }
  | { action: "approve"; teacherId: string }
  | { action: "createCourse"; name: string; school: string; isThesis: boolean }
  | { action: "setCourseActive"; courseId: string; active: boolean }
  | { action: "setAcademicTerm"; academicTerm: string }
  | {
      action: "setUserAccess";
      userId: string;
      role: AppRole;
      school: string;
    }
  | { action: "setPeriodClosed"; closed: boolean }
  | { action: "submit" };

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

export function ScheduleApp({
  preview = false,
  view,
}: {
  preview?: boolean;
  view: ViewKey;
}) {
  const router = useRouter();
  const endpoint = preview ? "/api/schedule?preview=1" : "/api/schedule";
  const [data, setData] = useState<SchedulePayload | null>(
    () => schedulePayloadCache.get(endpoint) ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null,
  );
  const [school, setSchool] = useState(schools[0]);
  const [courseId, setCourseId] = useState(courseCatalog[0].id);
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
      setError("No se pudo cargar la información institucional.");
      return;
    }
    const payload = (await response.json()) as SchedulePayload;
    writeData(payload);
    const nextSchool =
      payload.onboarding.school || payload.schools[0] || schools[0];
    const visibleCatalog = visibleCoursesForSchool(payload.catalog, nextSchool);
    setSchool(nextSchool);
    setCourseId((current) =>
      visibleCatalog.some((course) => course.id === current)
        ? current
        : (visibleCatalog[0]?.id ?? current),
    );
    setSelectedTeacherId((current) => current ?? payload.profile.id);
  }, [endpoint, writeData]);

  useEffect(() => {
    load();
  }, [load]);

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
    view,
  ]);

  const request = async (
    body: ScheduleAction,
    options: { commitPayload?: boolean; showSaving?: boolean } = {},
  ) => {
    const showSaving = options.showSaving ?? true;
    if (showSaving) {
      setSaving(true);
    }
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        toast.error(
          await readApiError(response, "No se pudo guardar el cambio."),
        );
        return null;
      }
      const payload = (await response.json()) as SchedulePayload;
      if (options.commitPayload !== false) {
        writeData(payload);
      }
      return payload;
    } catch {
      toast.error("No se pudo conectar con el servidor.");
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
    canUseDirection && view !== "docente" ? "Revisión" : "Docente";
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
      toast.error("El periodo académico está cerrado.");
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
      toast.error("El periodo académico está cerrado.");
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
      toast.error("El periodo académico está cerrado.");
      return;
    }
    const course = catalogForSchool.find((item) => item.id === courseId);
    if (!course) {
      return;
    }
    if (profile.courses.some((item) => item.id === course.id)) {
      toast.info("Ese curso ya está seleccionado.");
      return;
    }
    if (
      !course.isThesis &&
      validation.countedCourses >= contractRules[profile.contract].maxCourses
    ) {
      toast.error("Ya alcanzaste el máximo de cursos para tu clase docente.");
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
        toast.success("Curso agregado.");
      } else if (previous) {
        writeData(previous);
      }
    }
  };

  const handleRemoveCourse = async (id: string) => {
    if (periodClosed) {
      toast.error("El periodo académico está cerrado.");
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
        toast.success("Curso retirado.");
      } else if (previous) {
        writeData(previous);
      }
    }
  };

  const handleSubmit = async () => {
    if (periodClosed) {
      toast.error("El periodo académico está cerrado.");
      return;
    }
    if (!validation.complete) {
      toast.error("Aún faltan reglas por completar.");
      return;
    }
    const payload = await request({ action: "submit" });
    if (payload) {
      toast.success(
        teacherMode === "sandbox"
          ? "Prueba enviada. No afecta revisión oficial."
          : "Horario enviado para revisión.",
      );
    }
  };

  const handleExportXlsx = async () => {
    await exportXlsx(selectedTeacher, selectedValidation, academicTerm);
    toast.success("Excel generado.");
  };

  const handleExportPdf = async () => {
    await exportPdf(selectedTeacher, selectedValidation, academicTerm);
    toast.success("PDF generado.");
  };

  const handleExportAllPdf = async () => {
    if (!allTeachers.length) {
      toast.error("No hay docentes para exportar.");
      return;
    }
    await exportAllPdf(allTeachers, academicTerm);
    toast.success(`${allTeachers.length} páginas listas para imprimir.`);
  };

  const handleSelectTeacher = (id: string) => {
    const teacher = allTeachers.find((item) => item.id === id);
    setSelectedTeacherId(id);
    setReviewNote(teacher?.reviewNote ?? "");
  };

  const handleObserveTeacher = async () => {
    if (periodClosed) {
      toast.error("El periodo académico está cerrado.");
      return;
    }
    const note = reviewNote.trim();
    if (note.length < 8) {
      toast.error("Escribe una observación más específica.");
      return;
    }
    const payload = await request({
      action: "observe",
      teacherId: selectedTeacher.id,
      note,
    });
    if (payload) {
      toast.success("Observación registrada.");
      setReviewNote("");
    }
  };

  const handleApproveTeacher = async () => {
    if (periodClosed) {
      toast.error("El periodo académico está cerrado.");
      return;
    }
    if (selectedTeacher.status !== "enviado") {
      toast.error("Solo puedes aprobar horarios enviados.");
      return;
    }
    if (!selectedValidation.complete) {
      toast.error("El horario no cumple las reglas.");
      return;
    }
    const payload = await request({
      action: "approve",
      teacherId: selectedTeacher.id,
    });
    if (payload) {
      toast.success("Horario aprobado.");
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
      toast.success("Curso guardado en el catálogo.");
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
      toast.success(active ? "Curso reactivado." : "Curso suspendido.");
    }
  };

  const handleSetAcademicTerm = async (academicTermValue: string) => {
    const payload = await request({
      action: "setAcademicTerm",
      academicTerm: academicTermValue,
    });
    if (payload) {
      toast.success("Periodo académico actualizado.");
    }
    return payload;
  };

  const handleSetPeriodClosed = async (closed: boolean) => {
    const payload = await request({
      action: "setPeriodClosed",
      closed,
    });
    if (payload) {
      toast.success(closed ? "Periodo cerrado." : "Periodo reabierto.");
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
      toast.success("Acceso actualizado.");
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
        toast.error(
          await readApiError(response, "No se pudo importar el CSV."),
        );
        return null;
      }
      const result = (await response.json()) as TeacherCourseImportResponse;
      writeData(result.payload);
      if (result.ok) {
        toast.success(
          result.applied
            ? "Carga docente aplicada."
            : "CSV validado correctamente.",
        );
      } else {
        toast.error("CSV con observaciones por corregir.");
      }
      return result;
    } catch {
      toast.error("No se pudo conectar con el servidor.");
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
        toast.success("Curso asignado al docente.");
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
        toast.success("Curso retirado del docente.");
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
          schools={schoolOptions}
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

export function OnboardingRouteApp({ preview = false }: { preview?: boolean }) {
  const router = useRouter();
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const endpoint = preview ? "/api/schedule?preview=1" : "/api/schedule";

  useEffect(() => {
    fetch(endpoint, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("No se pudo cargar el perfil.");
        }
        setData((await response.json()) as SchedulePayload);
      })
      .catch((caught) => setError(caught.message));
  }, [endpoint]);

  const handleComplete = async (next: Onboarding) => {
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
      toast.error(
        await readApiError(response, "No se pudo guardar el perfil."),
      );
      return;
    }
    router.push("/docente");
  };

  if (error) {
    return <AppError error={error} onRetry={() => router.refresh()} />;
  }

  if (!data) {
    return <AppLoading />;
  }

  return (
    <OnboardingView
      defaultSchool={data.onboarding.school || schools[0]}
      onComplete={handleComplete}
      schoolOptions={data.schools.length ? data.schools : schools}
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
                  <span>Semestre académico {academicTerm}</span>
                  <ChevronRight className="size-3" />
                  <span className="truncate">{routeLabel(selectedView)}</span>
                </div>
                <h1 className="truncate font-serif text-lg font-semibold md:text-xl">
                  Horarios UNMSM
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
                {periodClosed ? "Periodo cerrado" : statusLabel(status)}
              </Badge>
              <Badge variant="outline" className="hidden md:inline-flex">
                {roleLabel(currentRole)}
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
  return (
    <>
      <SidebarHeader className="h-14 border-sidebar-border border-b p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0">
        <div className="flex h-10 w-full items-center gap-3 rounded-lg px-1 group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border group-data-[collapsible=icon]:border-sidebar-border group-data-[collapsible=icon]:bg-sidebar-accent group-data-[collapsible=icon]:px-0">
          <Image
            src="/escudo-unmsm.png"
            alt="Escudo UNMSM"
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
              Horarios
            </p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Sesión</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2 px-2">
            <p className="truncate font-medium text-sidebar-foreground">
              {userName}
            </p>
            <p className="text-sidebar-foreground/70 text-xs">
              {roleLabel(currentRole)}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
          <SidebarGroupLabel>Trabajo</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                isActive={selectedView === "docente"}
                render={<Link href="/docente" />}
                tooltip="Docente"
              >
                <CalendarClock />
                <span>Docente</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {canUseDirection ? (
              <SidebarMenuItem>
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                  isActive={selectedView === "direccion"}
                  render={<Link href="/direccion" />}
                  tooltip="Dirección"
                >
                  <Users />
                  <span>Dirección</span>
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
                    render={<Link href="/direccion/usuarios" />}
                    tooltip="Usuarios"
                  >
                    <UserCog />
                    <span>Usuarios</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                    isActive={selectedView === "auditoria"}
                    render={<Link href="/direccion/auditoria" />}
                    tooltip="Auditoría"
                  >
                    <History />
                    <span>Auditoría</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                    isActive={selectedView === "configuracion"}
                    render={<Link href="/direccion/configuracion" />}
                    tooltip="Configuración"
                  >
                    <Settings2 />
                    <span>Configuración</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </>
            ) : null}
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Progreso</SidebarGroupLabel>
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
                Cerrar sesión
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
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      aria-label="Cambiar tema"
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
  return (
    <main className="flex h-screen items-center justify-center bg-background p-6 text-foreground">
      <Alert variant="error" className="max-w-lg">
        <AlertCircle />
        <AlertTitle>No se pudo abrir Horarios UNMSM</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <AlertAction>
          <Button onClick={onRetry}>Reintentar</Button>
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

  const handleSubmit = async () => {
    if (!codeIsValid) {
      toast.error("Ingresa un código institucional válido.");
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
              alt="Escudo UNMSM"
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
                Horarios FISI
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <p className="font-serif text-3xl leading-tight">
              Un solo perfil para registrar tu disponibilidad.
            </p>
            <p className="text-sidebar-foreground/75 text-sm leading-6">
              Verificaremos tu escuela profesional y código docente antes de
              abrir el horario del semestre.
            </p>
          </div>
          <div className="grid gap-2 text-sm">
            {[
              "Disponibilidad semanal",
              "Cursos del semestre",
              "Envío a Dirección Académica",
            ].map((item) => (
              <div className="flex items-center gap-2" key={item}>
                <Check className="size-4 text-gold" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
        <Card className="min-h-0 overflow-hidden border-0 shadow-none">
          <CardHeader className="border-b p-4">
            <Badge variant="secondary" className="w-fit">
              Primer ingreso
            </Badge>
            <CardTitle className="font-serif text-2xl">
              Confirma tus datos
            </CardTitle>
            <CardDescription>
              Estos datos quedarán asociados a tu correo institucional.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-h-0 p-4">
            <div className="space-y-3">
              <Alert variant="info" className="rounded-md p-2.5">
                <Info />
                <AlertTitle>Cuenta detectada</AlertTitle>
                <AlertDescription>
                  {userEmail ?? "Correo institucional pendiente"}
                </AlertDescription>
              </Alert>
              <Field className="rounded-md border bg-muted/25 p-3">
                <div className="flex items-center gap-2 font-medium">
                  <CalendarClock className="size-4 text-gold" />
                  Docente
                </div>
                <FieldDescription>
                  Acceso para registrar disponibilidad, cursos y envío a
                  revisión.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Escuela profesional</FieldLabel>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona escuela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Escuelas</SelectLabel>
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
                <FieldLabel>Código docente</FieldLabel>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Ej. 082026"
                  type="text"
                />
                <FieldDescription>
                  Usa el código indicado por la facultad.
                </FieldDescription>
              </Field>
              <Button
                className="w-full"
                disabled={!codeIsValid}
                loading={saving}
                onClick={handleSubmit}
              >
                <Save data-icon="inline-start" />
                Guardar perfil
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
  const addCourseLabel = periodClosed
    ? "Cerrado"
    : selectedCourseAlreadyAdded
      ? "Agregado"
      : selectedCourseLimitReached
        ? "Cupo lleno"
        : "Agregar";
  const creditTotal = profile.courses.reduce(
    (total, course) => total + (course.credits ?? 0),
    0,
  );
  const hasKnownCredits = profile.courses.some((course) => course.credits);
  const sandboxMode = teacherMode === "sandbox";

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="flex shrink-0 flex-col gap-1.5 border-b px-3 py-1.5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <CardTitle className="truncate font-serif text-xl">
                Disponibilidad docente
              </CardTitle>
              {sandboxMode ? (
                <Badge
                  variant="outline"
                  className="border-warning text-warning"
                >
                  Modo prueba
                </Badge>
              ) : null}
            </div>
            <CardDescription className="truncate">
              Vista completa del horario {academicTerm}.
            </CardDescription>
          </div>
          <Toolbar className="shrink-0 border-0 bg-transparent p-0 shadow-none">
            <ToolbarGroup>
              {statusSaving ? (
                <Badge variant="secondary" className="hidden md:inline-flex">
                  Guardando
                </Badge>
              ) : null}
              <Select
                disabled={periodClosed}
                value={profile.contract}
                onValueChange={handleContractChange}
              >
                <SelectTrigger className="w-[190px]">
                  <SelectValue placeholder="Clase docente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>Clase docente</SelectLabel>
                    {Object.entries(contractRules).map(([key, item]) => (
                      <SelectItem key={key} value={key}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <ToolbarSeparator orientation="vertical" />
              <ToolbarButton
                disabled={saving || periodClosed}
                onClick={handleSubmit}
                render={<Button />}
              >
                <Send data-icon="inline-start" />
                Enviar
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
      <aside className="grid min-h-0 content-start gap-3 overflow-hidden">
        {sandboxMode ? (
          <Alert className="rounded-md p-2" variant="warning">
            <Info />
            <AlertTitle>Sandbox docente</AlertTitle>
            <AlertDescription className="text-xs">
              Tus horas, cursos y envío quedan separados de los docentes reales.
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
  const rule = contractRules[profile.contract];
  const items = [
    {
      complete: validation.selectedHours >= rule.requiredHours,
      label: "Horas",
      value: `${validation.selectedHours}/${rule.requiredHours}`,
    },
    {
      complete: validation.blockDays >= rule.requiredBlockDays,
      label: "Bloques",
      value: `${validation.blockDays}/${rule.requiredBlockDays}`,
    },
    {
      complete:
        validation.countedCourses > 0 &&
        validation.countedCourses <= rule.maxCourses,
      label: "Cursos",
      value: `${validation.countedCourses}/${rule.maxCourses}`,
    },
  ];

  return (
    <div className="grid shrink-0 gap-2 border-b bg-muted/25 px-3 py-2 text-sm lg:grid-cols-[minmax(0,1fr)_minmax(360px,auto)] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2 font-medium">
          <Info className="size-4 text-gold" />
          <span>Reglas activas</span>
        </div>
        <p className="mt-1 text-muted-foreground">{rule.text}</p>
      </div>
      <div className="grid min-w-0 grid-cols-3 gap-2">
        {items.map((item) => (
          <div className="rounded-md border bg-card px-2 py-1" key={item.label}>
            <div className="truncate text-muted-foreground text-xs">
              {item.label}
            </div>
            <div
              className={cn(
                "font-semibold tabular-nums",
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
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="shrink-0 border-b px-2.5 py-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate text-base">
              Cursos seleccionados
            </CardTitle>
            <CardDescription className="hidden truncate sm:block">
              Carga permitida por contrato.
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
              <SelectValue placeholder="Escuela" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Escuela Profesional</SelectLabel>
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
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Curso</SelectLabel>
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
            emptyDescription="Agrega los cursos que dictarás este semestre."
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
  });
  const catalogFiltersActive =
    catalogQuery.trim().length > 0 ||
    catalogStatusFilter !== "all" ||
    catalogSchoolFilter !== "all";
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
      toast.error("Ingresa un periodo académico válido.");
      return;
    }
    await onSetAcademicTerm(normalizedTerm);
  };

  const handleSubmit = async () => {
    const normalizedName = name.trim();
    if (normalizedName.length < 3 || selectedSchool.length < 3) {
      toast.error("Completa curso y escuela.");
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
      toast.error("Selecciona un CSV de carga docente.");
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
            Configuración institucional
          </CardTitle>
          <CardDescription>
            Periodo académico, escuelas y cursos.
          </CardDescription>
        </CardHeader>
        <CardContent className="min-h-0 p-0">
          <ScrollArea scrollFade scrollbarGutter>
            <div className="grid gap-2 px-2 py-1.5">
              <Field>
                <FieldLabel>Periodo académico vigente</FieldLabel>
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
                    Guardar
                  </Button>
                </div>
              </Field>
              <Field className="rounded-md border bg-muted/25 p-2">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <FieldLabel>Cierre de periodo</FieldLabel>
                    <FieldDescription>
                      {periodClosed
                        ? `Cerrado${periodClosedAt ? `: ${periodClosedAt}` : ""}`
                        : `${approvedCount}/${teacherCount} horarios aprobados.`}
                    </FieldDescription>
                  </div>
                  <Badge variant={periodClosed ? "default" : "secondary"}>
                    {periodClosed ? "Cerrado" : "Abierto"}
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
                    ? "Reabrir periodo"
                    : canClosePeriod
                      ? "Cerrar periodo"
                      : "Faltan aprobaciones"}
                </Button>
              </Field>
              <Field className="rounded-md border bg-muted/25 p-2">
                <div className="flex w-full items-start justify-between gap-3">
                  <div className="min-w-0">
                    <FieldLabel>Carga docente CSV</FieldLabel>
                    <FieldDescription className="truncate">
                      {teacherCourseImportFile || "Sin archivo seleccionado"}
                    </FieldDescription>
                  </div>
                  <Upload className="mt-0.5 size-4 shrink-0 text-gold" />
                </div>
                <Input
                  accept=".csv,text/csv"
                  aria-label="CSV de carga docente"
                  nativeInput
                  onChange={handleTeacherCourseFile}
                  size="sm"
                  type="file"
                />
                <Field className="flex-row items-center justify-between rounded-md border bg-background/70 px-2 py-1">
                  <div>
                    <FieldLabel className="text-xs">
                      Reemplazar docentes incluidos
                    </FieldLabel>
                    <FieldDescription>
                      Actualiza solo filas del CSV.
                    </FieldDescription>
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
                    Validar
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
                    Aplicar
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
                        ? `${teacherCourseImportResult.assignments} asignaciones`
                        : `${teacherCourseImportResult.errors.length} observaciones`}
                    </AlertTitle>
                    <AlertDescription>
                      {teacherCourseImportResult.ok ? (
                        <span>
                          {teacherCourseImportResult.teachers} docentes ·{" "}
                          {teacherCourseImportResult.rows} filas
                        </span>
                      ) : (
                        teacherCourseImportResult.errors
                          .slice(0, 3)
                          .map((item) => <span key={item}>{item}</span>)
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </Field>
              <Separator />
              <div>
                <h2 className="font-medium text-sm">Nuevo curso</h2>
                <p className="text-muted-foreground text-xs">
                  Disponible para selección docente.
                </p>
              </div>
              <Field>
                <FieldLabel>Escuela existente</FieldLabel>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona escuela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Escuelas activas</SelectLabel>
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
                <FieldLabel>Nueva escuela</FieldLabel>
                <Input
                  onChange={(event) => setCustomSchool(event.target.value)}
                  placeholder="Opcional"
                  value={customSchool}
                />
                <FieldDescription>
                  Si escribes aquí, se usará esta escuela.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Nombre del curso</FieldLabel>
                <Input
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ej. Ingeniería de Software"
                  value={name}
                />
              </Field>
              <Field className="flex-row items-center justify-between rounded-md border bg-muted/25 p-2">
                <div>
                  <FieldLabel>Cuenta como Tesis</FieldLabel>
                  <FieldDescription>
                    No consume cupo de cursos.
                  </FieldDescription>
                </div>
                <Switch checked={isThesis} onCheckedChange={setIsThesis} />
              </Field>
              <Button
                disabled={!name.trim() || !selectedSchool}
                loading={saving}
                onClick={handleSubmit}
              >
                <Plus data-icon="inline-start" />
                Guardar curso
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
                Configuración de catálogo
              </CardTitle>
              <CardDescription className="truncate">
                Cursos activos disponibles para selección docente.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {filteredCatalog.length}/{catalog.length}
            </Badge>
          </div>
          <div className="grid gap-1.5 md:grid-cols-[minmax(180px,1fr)_150px_190px]">
            <Input
              aria-label="Buscar curso"
              onChange={(event) => setCatalogQuery(event.target.value)}
              placeholder="Buscar curso o escuela"
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
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Estado</SelectLabel>
                  <SelectItem value="all">Todo estado</SelectItem>
                  <SelectItem value="active">
                    Activos ({activeCount})
                  </SelectItem>
                  <SelectItem value="suspended">
                    Suspendidos ({inactiveCount})
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select
              value={catalogSchoolFilter}
              onValueChange={setCatalogSchoolFilter}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Escuela" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Escuela</SelectLabel>
                  <SelectItem value="all">Todas las escuelas</SelectItem>
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
  if (!catalog.length) {
    return (
      <Empty className="h-full py-10">
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {filtersActive ? "Sin coincidencias" : "Sin cursos configurados"}
          </EmptyTitle>
          <EmptyDescription>
            {filtersActive
              ? "Ajusta búsqueda, estado o escuela para ver más cursos."
              : "Agrega el primer curso institucional."}
          </EmptyDescription>
        </EmptyHeader>
        {filtersActive ? (
          <EmptyContent>
            <Button onClick={clearFilters} size="sm" variant="outline">
              Limpiar filtros
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
            <TableHead className="h-9 w-12 px-2">N°</TableHead>
            <TableHead className="h-9 px-2">Curso</TableHead>
            <TableHead className="h-9 px-2">Escuela Profesional</TableHead>
            <TableHead className="h-9 w-28 px-2">Estado</TableHead>
            <TableHead className="h-9 w-24 px-2 text-right">Activo</TableHead>
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
                    {courseMeta(course)}
                  </div>
                  {course.isThesis ? (
                    <Badge variant="secondary" className="ml-2">
                      Tesis
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="px-2 py-1 text-muted-foreground">
                  {course.school}
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Badge variant={active ? "default" : "secondary"}>
                    {active ? "Activo" : "Suspendido"}
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
  onSetUserAccess,
  saving,
  schools,
  users,
}: {
  currentUserId: string;
  onSetUserAccess: (
    userId: string,
    role: AppRole,
    school: string,
  ) => Promise<SchedulePayload | null>;
  saving: boolean;
  schools: string[];
  users: ScheduleUser[];
}) {
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
                Usuarios institucionales
              </CardTitle>
              <CardDescription className="truncate">
                Roles, escuelas, padrón docente e ingreso real.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {filteredUsers.length}/{users.length}
            </Badge>
          </div>
          <div className="grid gap-1.5 md:grid-cols-[minmax(180px,1fr)_160px_160px]">
            <Input
              aria-label="Buscar usuario"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nombre o correo"
              size="sm"
              type="search"
              value={query}
            />
            <Select
              value={roleFilter}
              onValueChange={(value) => setRoleFilter(value as UserRoleFilter)}
            >
              <SelectTrigger className="w-full" size="sm">
                <SelectValue placeholder="Rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Rol</SelectLabel>
                  <SelectItem value="all">Todos los roles</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="direccion">Dirección</SelectItem>
                  <SelectItem value="docente">Docente</SelectItem>
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
                <SelectValue placeholder="Ingreso" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Ingreso</SelectLabel>
                  <SelectItem value="all">Todo ingreso</SelectItem>
                  <SelectItem value="complete">Ya ingresó</SelectItem>
                  <SelectItem value="pending">Sin ingreso</SelectItem>
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
            schools={schools}
            users={filteredUsers}
          />
        </CardContent>
      </Card>
      <aside className="grid min-h-0 gap-3 xl:grid-rows-[auto_auto_minmax(0,1fr)]">
        <Card size="sm">
          <CardHeader className="border-b px-2.5 py-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-availability" />
              Acceso
            </CardTitle>
            <CardDescription>Resumen operativo.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-2 px-2.5 py-2">
            <StatusMetric label="Admin" value={String(adminCount)} />
            <StatusMetric label="Dirección" value={String(directionCount)} />
            <StatusMetric label="Docentes" value={String(teacherCount)} />
          </CardContent>
        </Card>
        <Alert variant={adminCount > 0 ? "default" : "warning"}>
          <Info />
          <AlertTitle>Regla de seguridad</AlertTitle>
          <AlertDescription>
            El sistema mantiene al menos un usuario Admin. Sin ingreso:{" "}
            {pendingAccess}.
          </AlertDescription>
        </Alert>
      </aside>
    </section>
  );
}

function UsersAccessTable({
  clearFilters,
  currentUserId,
  filtersActive,
  onSetUserAccess,
  saving,
  schools,
  users,
}: {
  clearFilters: () => void;
  currentUserId: string;
  filtersActive: boolean;
  onSetUserAccess: (
    userId: string,
    role: AppRole,
    school: string,
  ) => Promise<SchedulePayload | null>;
  saving: boolean;
  schools: string[];
  users: ScheduleUser[];
}) {
  if (!users.length) {
    return (
      <Empty className="h-full py-10">
        <EmptyMedia variant="icon">
          <UserCog />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>
            {filtersActive ? "Sin coincidencias" : "Sin usuarios"}
          </EmptyTitle>
          <EmptyDescription>
            {filtersActive
              ? "Ajusta búsqueda, rol o ingreso para ver más usuarios."
              : "Los usuarios aparecerán después de iniciar sesión."}
          </EmptyDescription>
        </EmptyHeader>
        {filtersActive ? (
          <EmptyContent>
            <Button onClick={clearFilters} size="sm" variant="outline">
              Limpiar filtros
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
            <TableHead className="h-9 min-w-[250px] px-2">Usuario</TableHead>
            <TableHead className="h-9 w-52 px-2">Padrón</TableHead>
            <TableHead className="h-9 w-40 px-2">Rol</TableHead>
            <TableHead className="h-9 w-56 px-2">Escuela</TableHead>
            <TableHead className="h-9 w-36 px-2">Ingreso</TableHead>
            <TableHead className="h-9 w-32 px-2">Horario</TableHead>
            <TableHead className="h-9 w-36 px-2 text-right">
              Actualizado
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
                            Tú
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
                      {user.teacherCode ?? "Sin código"}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {user.teacherCategory ?? "Sin categoría"}
                    </div>
                    <div className="truncate text-muted-foreground text-xs">
                      {user.academicDegree ?? "Sin grado académico"}
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
                        <SelectLabel>Rol</SelectLabel>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="docente">Docente</SelectItem>
                        <SelectItem value="direccion">Dirección</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="px-2 py-1">
                  <Select
                    disabled={saving}
                    value={user.school}
                    onValueChange={(school) =>
                      onSetUserAccess(user.clerkUserId, user.role, school)
                    }
                  >
                    <SelectTrigger className="w-full" size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Escuela</SelectLabel>
                        {schools.map((school) => (
                          <SelectItem key={school} value={school}>
                            {school}
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
                    {user.onboardingComplete ? "Ingresó" : "Sin ingreso"}
                  </Badge>
                  <div className="mt-0.5 text-muted-foreground text-xs tabular-nums">
                    {user.lastSeenAt
                      ? formatEventDate(user.lastSeenAt)
                      : "Nunca"}
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
                      {statusLabel(user.teacherStatus)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">No aplica</span>
                  )}
                </TableCell>
                <TableCell className="px-2 py-1 text-right text-muted-foreground text-xs tabular-nums">
                  {formatEventDate(user.updatedAt)}
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
          eventLabel(event.eventType),
          event.eventType,
          eventSummary(event),
          JSON.stringify(event.metadata),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      }),
    [eventType, events, query],
  );

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3">
      <Card className="min-h-0 overflow-hidden" size="sm">
        <CardHeader className="flex shrink-0 flex-col gap-1.5 border-b lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate font-serif text-xl">
              Auditoría institucional
            </CardTitle>
            <CardDescription className="truncate">
              Historial institucional.
            </CardDescription>
          </div>
          <div className="grid w-full shrink-0 gap-2 md:grid-cols-[220px_220px_auto] lg:w-auto">
            <Input
              aria-label="Buscar auditoría"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar auditoría"
              value={query}
            />
            <Select value={eventType} onValueChange={setEventType}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tipo de evento" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Tipo de evento</SelectLabel>
                  <SelectItem value="all">Todos</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {eventLabel(type)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button
              disabled={!filteredEvents.length}
              onClick={() => exportAuditCsv(filteredEvents)}
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
                <EmptyTitle>Sin eventos</EmptyTitle>
                <EmptyDescription>
                  Ajusta búsqueda o tipo de evento.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function AuditEventsTable({ events }: { events: ScheduleEvent[] }) {
  return (
    <ScrollArea scrollbarGutter>
      <Table className="text-sm">
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className="h-9">
            <TableHead className="h-9 min-w-[180px] px-2">Fecha</TableHead>
            <TableHead className="h-9 min-w-[220px] px-2">Evento</TableHead>
            <TableHead className="h-9 min-w-[180px] px-2">Actor</TableHead>
            <TableHead className="h-9 min-w-[180px] px-2">Referencia</TableHead>
            <TableHead className="h-9 px-2">Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow className="h-11" key={event.id}>
              <TableCell className="px-2 py-1 text-muted-foreground text-xs tabular-nums">
                {formatEventDate(event.createdAt)}
              </TableCell>
              <TableCell className="px-2 py-1">
                <div className="font-medium">{eventLabel(event.eventType)}</div>
                <div className="text-muted-foreground text-xs">
                  {eventScopeLabel(event.eventType)}
                </div>
              </TableCell>
              <TableCell className="px-2 py-1">{event.actorName}</TableCell>
              <TableCell className="px-2 py-1 text-muted-foreground">
                {event.teacherId}
              </TableCell>
              <TableCell className="px-2 py-1 text-muted-foreground">
                {eventSummary(event) || "Sin detalle"}
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
  const rule = contractRules[profile.contract];
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
              Cierre docente
            </CardTitle>
            <CardDescription className="hidden sm:block">
              {rule.requiredHours} h · {rule.requiredBlockDays} bloques ·{" "}
              {rule.maxCourses} cursos
            </CardDescription>
          </div>
          <Badge variant={validation.complete ? "default" : "secondary"}>
            {validation.complete ? "Listo" : "Pendiente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 px-2.5 py-2 text-sm">
        {profile.reviewNote ? (
          <Alert variant="warning" className="p-2.5">
            <AlertCircle />
            <AlertTitle>Observación de Dirección</AlertTitle>
            <AlertDescription>{profile.reviewNote}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <StatusMetric
            label="Horas"
            value={`${validation.selectedHours}/${rule.requiredHours}`}
          />
          <StatusMetric
            label="Bloques"
            value={`${validation.blockDays}/${rule.requiredBlockDays}`}
          />
          <StatusMetric
            label="Cursos"
            value={`${validation.countedCourses}/${rule.maxCourses}`}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-muted-foreground">
            {profile.approvedAt
              ? `Aprobado: ${profile.approvedAt}`
              : profile.submittedAt
                ? `Último envío: ${profile.submittedAt}`
                : "Sin envío registrado"}
          </span>
          <Button
            size="sm"
            disabled={periodClosed}
            loading={saving}
            onClick={onSubmit}
          >
            Enviar
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
                Lista de docentes
              </CardTitle>
              <CardDescription className="truncate">
                Revisión administrativa.
              </CardDescription>
            </div>
            <Badge variant="secondary">
              {teachers.length}/{totalTeacherCount}
            </Badge>
          </div>
          <div className="grid gap-1">
            <Input
              aria-label="Buscar docente"
              onChange={(event) => setTeacherQuery(event.target.value)}
              placeholder="Buscar docente o correo"
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
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Estado</SelectLabel>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="borrador">Borrador</SelectItem>
                  <SelectItem value="enviado">Enviado</SelectItem>
                  <SelectItem value="observado">Observado</SelectItem>
                  <SelectItem value="aprobado">Aprobado</SelectItem>
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
              <FieldLabel className="text-xs">Solo pendientes</FieldLabel>
              <FieldDescription>Oculta aprobados.</FieldDescription>
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
                        ? "Sin coincidencias"
                        : "Sin docentes pendientes"}
                    </EmptyTitle>
                    <EmptyDescription>
                      {teacherFiltersActive
                        ? "Ajusta búsqueda o estado para revisar más docentes."
                        : "Desactiva el filtro para revisar enviados."}
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
                        Limpiar filtros
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
                    ? "Sin docente visible"
                    : "Sin docentes para revisar"}
                </EmptyTitle>
                <EmptyDescription>
                  {teacherFiltersActive
                    ? "Limpia o ajusta filtros para abrir un horario."
                    : "Los docentes aparecerán después de completar su acceso."}
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
                    Limpiar filtros
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
                  {teacherProfileSummary(selectedTeacher)}
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
                      Detalle
                    </SheetTrigger>
                    <SheetContent side="right">
                      <SheetHeader>
                        <SheetTitle>{selectedTeacher.name}</SheetTitle>
                        <SheetDescription>
                          Cursos y reglas del docente seleccionado.
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
                    PDF todos
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
                    Excel
                  </ToolbarButton>
                </ToolbarGroup>
              </Toolbar>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 p-0">
              <ScheduleBoard
                availability={selectedTeacher.availability}
                emptyDescription="El docente aún no marcó bloques horarios."
                emptyLabel="Sin disponibilidad registrada"
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
  const rows: Array<{
    label: string;
    value: number;
    tone: "default" | "secondary";
  }> = [
    { label: "Borrador", value: counts.borrador, tone: "secondary" },
    { label: "Enviado", value: counts.enviado, tone: "default" },
    { label: "Obs.", value: counts.observado, tone: "secondary" },
    { label: "Aprob.", value: counts.aprobado, tone: "default" },
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
      label: "Carga",
      value: `${teachersWithCourses}/${totalTeachers}`,
      detail: `${assignedCourses} cursos`,
      warning: assignedCourses === 0,
    },
    {
      label: "Horarios",
      value: `${teachersWithAvailability}/${totalTeachers}`,
      detail: "recibidos",
      warning: teachersWithAvailability === 0,
    },
    {
      label: "Eventos",
      value: String(events.length),
      detail: "auditados",
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
  return (
    <Tabs defaultValue="revision" className="h-full min-h-0 w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="revision">Revisión</TabsTrigger>
        <TabsTrigger value="cursos">Cursos</TabsTrigger>
        <TabsTrigger value="auditoria">Auditoría</TabsTrigger>
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
    ? "Cerrado"
    : assignment.alreadyAssigned
      ? "Asignado"
      : assignment.limitReached
        ? "Cupo lleno"
        : "Asignar";

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
        <CardTitle className="text-base">Cursos del docente</CardTitle>
        <CardDescription>
          Asignación administrativa de carga docente.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 px-2 py-2">
        <div className="grid gap-1.5">
          <Select
            disabled={disabled || saving}
            value={school}
            onValueChange={setSchool}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder="Escuela" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Escuela profesional</SelectLabel>
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
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Curso</SelectLabel>
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
              {contractRules[teacher.contract].label}: máximo{" "}
              {contractRules[teacher.contract].maxCourses} cursos no Tesis.
            </p>
          ) : null}
        </div>
        <div className="h-[clamp(160px,34vh,320px)] min-h-0 overflow-hidden rounded-md border bg-muted/20">
          <CourseCardsList
            courses={teacher.courses}
            emptyDescription="Asigna cursos desde el catálogo activo."
            emptyTitle="Sin cursos asignados"
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
  const canApprove =
    !periodClosed &&
    selectedTeacher.status === "enviado" &&
    validation.complete;
  const canObserve = !periodClosed && selectedTeacher.status !== "borrador";

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b px-3 py-1.5">
        <CardTitle className="text-base">Decisión de revisión</CardTitle>
        <CardDescription>
          Aprueba el horario o devuélvelo con una nota accionable.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 px-3 py-2">
        {selectedTeacher.approvedAt ? (
          <Alert variant="success" className="p-2.5">
            <ShieldCheck />
            <AlertTitle>Horario aprobado</AlertTitle>
            <AlertDescription>{selectedTeacher.approvedAt}</AlertDescription>
          </Alert>
        ) : null}
        {selectedTeacher.reviewNote ? (
          <Alert variant="warning" className="p-2.5">
            <AlertCircle />
            <AlertTitle>Observación vigente</AlertTitle>
            <AlertDescription>{selectedTeacher.reviewNote}</AlertDescription>
          </Alert>
        ) : null}
        <Textarea
          aria-label="Observación para el docente"
          onChange={(event) => setReviewNote(event.target.value)}
          placeholder="Ej. Ajustar viernes 14:00 - 18:00 por cruce con aula asignada."
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
            Observar
          </Button>
          <Button
            disabled={!canApprove}
            loading={saving}
            onClick={onApproveTeacher}
          >
            Aprobar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AuditTrailCard({ events }: { events: ScheduleEvent[] }) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="border-b px-3 py-1.5">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="size-4 text-gold" />
          Auditoría
        </CardTitle>
        <CardDescription>Últimos cambios registrados.</CardDescription>
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
                      {eventLabel(event.eventType)}
                    </span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {formatEventDate(event.createdAt)}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    {event.actorName}
                    {eventSummary(event) ? ` · ${eventSummary(event)}` : ""}
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
              <EmptyTitle>Sin actividad</EmptyTitle>
              <EmptyDescription>
                Los cambios del docente aparecerán aquí.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}

function LockedDirectionView() {
  return (
    <section className="flex h-full items-center justify-center p-6">
      <Alert className="max-w-xl" variant="warning">
        <LockKeyhole />
        <AlertTitle>Ruta restringida</AlertTitle>
        <AlertDescription>
          Esta ruta está disponible solo para cuentas con rol Admin.
        </AlertDescription>
        <AlertAction>
          <Link className={buttonVariants({ size: "sm" })} href="/docente">
            Volver a docente
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
          {statusLabel(teacher.status)}
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

  return (
    <div className="relative h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full min-w-[660px] flex-col">
        <div className="grid h-11 shrink-0 grid-cols-[92px_repeat(6,minmax(94px,1fr))] border-b bg-primary text-primary-foreground text-sm">
          <div className="flex items-center border-r px-3 font-medium">
            Hora
          </div>
          {days.map((day) => (
            <div
              className="flex items-center justify-center border-r px-3 font-medium last:border-r-0"
              key={day.key}
            >
              {day.label}
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
                const label = `${day.label} ${formatHour(hour)}: ${
                  isSelected ? "disponible" : "sin marcar"
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
  const rule = contractRules[profile.contract];
  const rows = [
    {
      label: "Horas mínimas",
      complete: validation.selectedHours >= rule.requiredHours,
      value: `${validation.selectedHours}/${rule.requiredHours}`,
    },
    {
      label: "Bloques de 4 h",
      complete: validation.blockDays >= rule.requiredBlockDays,
      value: `${validation.blockDays}/${rule.requiredBlockDays}`,
    },
    {
      label: "Cursos",
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
          Reglas activas
        </CardTitle>
        <CardDescription>{rule.text}</CardDescription>
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
  emptyDescription = "Agrega un curso para habilitar la validación.",
  emptyTitle = "Sin cursos",
  onRemoveCourse,
  removeDisabled = false,
}: {
  courses: Course[];
  emptyDescription?: string;
  emptyTitle?: string;
  onRemoveCourse?: (id: string) => void;
  removeDisabled?: boolean;
}) {
  if (!courses.length) {
    return (
      <Empty className="h-full px-3 py-8">
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
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
                    Tesis
                  </Badge>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-muted-foreground text-xs">
                {courseMeta(course)}
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
                  <span className="sr-only">Quitar curso</span>
                </TooltipTrigger>
                <TooltipContent>Quitar curso</TooltipContent>
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
  }: {
    query: string;
    showOnlyPending: boolean;
    statusFilter: TeacherStatusFilter;
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
      statusLabel(teacher.status),
      contractRules[teacher.contract].label,
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
  }: {
    onboardingFilter: UserOnboardingFilter;
    query: string;
    roleFilter: UserRoleFilter;
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
      roleLabel(user.role),
      user.school,
      user.teacherCode ?? "",
      user.teacherCategory ?? "",
      user.academicDegree ?? "",
      user.teacherStatus ? statusLabel(user.teacherStatus) : "No aplica",
      user.onboardingComplete ? "Ingresó" : "Sin ingreso",
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
  }: {
    query: string;
    schoolFilter: string;
    statusFilter: CourseStatusFilter;
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
      course.cycle ? `Ciclo ${course.cycle}` : "",
      course.credits ? `${course.credits} créditos` : "",
      active ? "Activo" : "Suspendido",
      course.isThesis ? "Tesis" : "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });
}

function courseLabel(course: Course) {
  return course.code ? `${course.code} · ${course.name}` : course.name;
}

function courseMeta(course: Course) {
  return [
    course.code,
    course.cycle ? `Ciclo ${course.cycle}` : "",
    course.credits ? `${course.credits} cr.` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function teacherButtonMeta(teacher: TeacherProfile) {
  return [teacher.teacherCode, teacher.email].filter(Boolean).join(" · ");
}

function teacherProfileSummary(teacher: TeacherProfile) {
  return [
    contractRules[teacher.contract].label,
    statusLabel(teacher.status),
    teacher.teacherCode ? `Código ${teacher.teacherCode}` : "",
    teacher.category,
    teacher.academicDegree,
  ]
    .filter(Boolean)
    .join(" · ");
}

function statusLabel(status: TeacherProfile["status"]) {
  if (status === "aprobado") {
    return "Aprobado";
  }
  if (status === "enviado") {
    return "Enviado";
  }
  if (status === "observado") {
    return "Observado";
  }
  return "Borrador";
}

function roleLabel(role: AppRole) {
  if (role === "admin") {
    return "Admin";
  }
  return role === "direccion" ? "Dirección" : "Docente";
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

function routeLabel(view: ViewKey) {
  if (view === "configuracion") {
    return "Configuración";
  }
  if (view === "usuarios") {
    return "Usuarios";
  }
  if (view === "auditoria") {
    return "Auditoría";
  }
  return view === "direccion" ? "Dirección" : "Docente";
}

function eventLabel(eventType: string) {
  const labels: Record<string, string> = {
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
  return labels[eventType] ?? eventType;
}

function eventScopeLabel(eventType: string) {
  if (eventType.startsWith("teacher.")) {
    return "Docente";
  }
  if (eventType.startsWith("director.")) {
    return "Dirección";
  }
  if (eventType.startsWith("catalog.")) {
    return "Catálogo";
  }
  if (eventType.startsWith("access.")) {
    return "Accesos";
  }
  if (eventType.startsWith("settings.") || eventType.startsWith("period.")) {
    return "Periodo";
  }
  if (eventType.startsWith("onboarding.")) {
    return "Onboarding";
  }
  return "Sistema";
}

function eventSummary(event: ScheduleEvent) {
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
    return event.metadata.active ? "Curso activo" : "Curso suspendido";
  }
  if (typeof event.metadata.contract === "string") {
    return contractRules[event.metadata.contract as ContractKey]?.label;
  }
  if (typeof event.metadata.slots === "number") {
    return `${event.metadata.slots} bloques marcados`;
  }
  if (typeof event.metadata.courseId === "string") {
    const name =
      typeof event.metadata.courseName === "string"
        ? event.metadata.courseName
        : "";
    return [name, event.metadata.courseId].filter(Boolean).join(" · ");
  }
  if (typeof event.metadata.importedCourses === "number") {
    return `${event.metadata.importedCourses} cursos importados`;
  }
  return "";
}

function formatEventDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function exportAuditCsv(events: ScheduleEvent[]) {
  const rows = [
    ["Fecha", "Evento", "Tipo", "Actor", "Referencia", "Detalle"],
    ...events.map((event) => [
      formatEventDate(event.createdAt),
      eventLabel(event.eventType),
      event.eventType,
      event.actorName,
      event.teacherId,
      eventSummary(event),
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
) {
  const XLSX = await import("xlsx");
  const { rows, merges, rowHeights } = buildPrintedScheduleSheetRows(
    profile,
    validation,
    academicTerm,
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
  XLSX.utils.book_append_sheet(workbook, worksheet, "Disponibilidad");
  XLSX.writeFile(workbook, `${printedScheduleFileName(profile)}.xlsx`, {
    cellStyles: true,
  });
}

async function exportPdf(
  profile: TeacherProfile,
  _validation: Validation,
  academicTerm: string,
) {
  const { jsPDF } = await import("jspdf");
  const doc = createPrintedScheduleDocument(jsPDF);
  drawPrintedSchedulePage(doc, profile, academicTerm);
  doc.save(`${printedScheduleFileName(profile)}.pdf`);
}

async function exportAllPdf(profiles: TeacherProfile[], academicTerm: string) {
  const { jsPDF } = await import("jspdf");
  const doc = createPrintedScheduleDocument(jsPDF);
  profiles.forEach((profile, index) => {
    if (index > 0) {
      doc.addPage("a4", "portrait");
    }
    drawPrintedSchedulePage(doc, profile, academicTerm);
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

  drawCell(
    margin,
    y,
    tableWidth,
    19,
    "UNIVERSIDAD NACIONAL MAYOR DE SAN MARCOS\nFACULTAD DE INGENIERIA DE SISTEMAS E INFORMATICA\nSIGESDAC\nDISPONIBILIDAD DOCENTE",
    { align: "center", bold: true, fontSize: 7.6, padding: 2 },
  );
  y += 21;

  drawCell(margin, y, tableWidth, 5.5, "DATOS GENERALES", {
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 5.5;
  drawCell(
    margin,
    y,
    tableWidth * 0.7,
    7,
    `Apellidos y Nombres: ${profile.name}`,
    { fontSize: 8 },
  );
  drawCell(
    margin + tableWidth * 0.7,
    y,
    tableWidth * 0.3,
    7,
    `Código: ${profile.teacherCode ?? "-"}`,
    { fontSize: 8 },
  );
  y += 10;

  drawCell(margin, y, tableWidth, 5.5, "DISPONIBILIDAD", {
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 5.5;
  const availabilityColumnWidth = tableWidth / 4;
  ["SEMESTRE", "FECHA", "CATEGORIA", "HORAS"].forEach((label, index) => {
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
    printedCategory(profile),
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

  drawCell(margin, y, tableWidth, 6, "HORARIOS DE DISPONIBILIDAD", {
    align: "center",
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 6;
  const hourColumnWidth = 30;
  const dayColumnWidth = (tableWidth - hourColumnWidth) / days.length;
  const scheduleRowHeight = 8.3;
  drawCell(margin, y, hourColumnWidth, 7, "Hora", {
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
      day.label,
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

  drawCell(margin, y, tableWidth, 6, "CURSOS QUE DESEA DICTAR", {
    align: "center",
    bold: true,
    fill: sectionFill,
    fontSize: 8,
  });
  y += 6;
  const courseColumnWidth = tableWidth * 0.53;
  const schoolColumnWidth = tableWidth - courseColumnWidth;
  drawCell(margin, y, courseColumnWidth, 6, "CURSO", {
    bold: true,
    fill: thinFill,
    fontSize: 8,
  });
  drawCell(margin + courseColumnWidth, y, schoolColumnWidth, 6, "ESCUELA", {
    bold: true,
    fill: thinFill,
    fontSize: 8,
  });
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

  const titleRow = addRow(
    [
      "UNIVERSIDAD NACIONAL MAYOR DE SAN MARCOS\nFACULTAD DE INGENIERIA DE SISTEMAS E INFORMATICA\nSIGESDAC\nDISPONIBILIDAD DOCENTE",
    ],
    54,
  );
  merge(titleRow, 0, titleRow, 6);

  const generalHeader = addRow(["DATOS GENERALES"], 18);
  merge(generalHeader, 0, generalHeader, 6);
  const generalRow = addRow(
    [
      `Apellidos y Nombres: ${profile.name}`,
      "",
      "",
      "",
      "",
      `Código: ${profile.teacherCode ?? "-"}`,
    ],
    20,
  );
  merge(generalRow, 0, generalRow, 4);
  merge(generalRow, 5, generalRow, 6);

  const availabilityHeader = addRow(["DISPONIBILIDAD"], 18);
  merge(availabilityHeader, 0, availabilityHeader, 6);
  const availabilityLabels = addRow(
    ["SEMESTRE", "", "FECHA", "", "CATEGORIA", "", "HORAS"],
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
      printedCategory(profile),
      "",
      contractRules[profile.contract].requiredHours,
    ],
    22,
  );
  merge(availabilityValues, 0, availabilityValues, 1);
  merge(availabilityValues, 2, availabilityValues, 3);
  merge(availabilityValues, 4, availabilityValues, 5);

  const scheduleHeader = addRow(["HORARIOS DE DISPONIBILIDAD"], 18);
  merge(scheduleHeader, 0, scheduleHeader, 6);
  addRow(["Hora", ...days.map((day) => day.label)], 20);
  hours.forEach((hour) => {
    addRow(
      [
        formatHour(hour),
        ...days.map((day) => (selected.has(slotKey(day.key, hour)) ? "X" : "")),
      ],
      21,
    );
  });

  const coursesHeader = addRow(["CURSOS QUE DESEA DICTAR"], 18);
  merge(coursesHeader, 0, coursesHeader, 6);
  const courseLabels = addRow(["CURSO", "", "", "", "ESCUELA"], 20);
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
      `Horas marcadas: ${validation.selectedHours} / ${contractRules[profile.contract].requiredHours}`,
      "",
      `Bloques: ${validation.blockDays}`,
      "",
      `Cursos: ${validation.countedCourses}`,
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

function printedCategory(profile: TeacherProfile) {
  const category = profile.category?.trim();
  const categoryLabel = category
    ? (teacherCategoryLabels[category.toUpperCase()] ?? category)
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

export function SignedOutShell() {
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background p-3 text-foreground md:p-6">
      <section className="grid h-full max-h-[620px] w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-sm md:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col justify-between bg-sidebar p-6 text-sidebar-foreground md:p-8">
          <div className="flex items-center gap-3">
            <Image
              src="/escudo-unmsm.png"
              alt="Escudo UNMSM"
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
                Horarios FISI
              </h1>
            </div>
          </div>
          <div className="max-w-xl space-y-4">
            <p className="font-serif text-3xl leading-tight md:text-4xl">
              Registro académico de disponibilidad docente.
            </p>
            <p className="max-w-lg text-sidebar-foreground/75 text-sm leading-6">
              Acceso para docentes y Dirección Académica de la Facultad de
              Ingeniería de Sistemas e Informática.
            </p>
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-3">
            {["Docentes", "Dirección", "Semestre 2026.2"].map((item) => (
              <div className="border-sidebar-border border-t pt-2" key={item}>
                <span className="text-sidebar-foreground/70">{item}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex min-h-0 items-center bg-card p-5 md:p-6">
          <div className="w-full space-y-5">
            <div className="space-y-1">
              <Badge variant="secondary">Acceso institucional</Badge>
              <h2 className="font-serif text-2xl font-semibold">
                Iniciar sesión
              </h2>
              <p className="text-muted-foreground text-sm leading-6">
                Usa el correo registrado por la facultad para entrar al sistema
                de horarios.
              </p>
            </div>
            <SignInButton mode="modal">
              <Button className="h-11 w-full">
                <GraduationCap data-icon="inline-start" />
                Ingresar con mi cuenta
              </Button>
            </SignInButton>
            <p className="border-t pt-3 text-muted-foreground text-xs leading-5">
              Si tu correo no está habilitado, comunícate con Dirección
              Académica FISI.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
