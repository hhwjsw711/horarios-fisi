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
  GraduationCap,
  Home,
  Info,
  LockKeyhole,
  Moon,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
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
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio-group";
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
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import type { AppRole, Onboarding, SchedulePayload } from "@/lib/schedule-db";
import { cn } from "@/lib/utils";

type ViewKey = "docente" | "direccion";

type Validation = {
  selectedHours: number;
  countedCourses: number;
  blockDays: number;
  complete: boolean;
};

type ScheduleAction =
  | { action: "setContract"; contract: ContractKey }
  | { action: "setAvailability"; availability: string[] }
  | { action: "addCourse"; courseId: string }
  | { action: "removeCourse"; courseId: string }
  | { action: "submit" };

export function ScheduleApp({
  preview = false,
  view,
}: {
  preview?: boolean;
  view: ViewKey;
}) {
  const router = useRouter();
  const [data, setData] = useState<SchedulePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(
    null,
  );
  const [school, setSchool] = useState(schools[0]);
  const [courseId, setCourseId] = useState(courseCatalog[0].id);
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [saving, setSaving] = useState(false);

  const endpoint = preview ? "/api/schedule?preview=1" : "/api/schedule";

  const load = useCallback(async () => {
    setError(null);
    const response = await fetch(endpoint, { cache: "no-store" });
    if (!response.ok) {
      setError("No se pudo cargar la información institucional.");
      return;
    }
    const payload = (await response.json()) as SchedulePayload;
    setData(payload);
    setSchool(payload.onboarding.school || schools[0]);
    setSelectedTeacherId((current) => current ?? payload.profile.id);
  }, [endpoint]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!preview && data && !data.onboarding.complete) {
      router.replace("/onboarding");
    }
  }, [data, preview, router]);

  const request = async (body: ScheduleAction) => {
    setSaving(true);
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error("No se pudo guardar el cambio.");
      return null;
    }
    const payload = (await response.json()) as SchedulePayload;
    setData(payload);
    return payload;
  };

  if (error) {
    return <AppError error={error} onRetry={load} />;
  }

  if (!data) {
    return <AppLoading />;
  }

  const profile = data.profile;
  const allTeachers = data.teachers;
  const filteredTeachers = showOnlyPending
    ? allTeachers.filter((teacher) => teacher.status !== "enviado")
    : allTeachers;
  const selectedTeacher =
    allTeachers.find((teacher) => teacher.id === selectedTeacherId) ?? profile;
  const validation = validateTeacher(profile);
  const selectedValidation = validateTeacher(selectedTeacher);
  const catalogForSchool = courseCatalog.filter(
    (course) => course.school === school || course.school === "Transversal",
  );
  const completion = completionFor(profile, validation);
  const canUseDirection = data.canUseDirection;
  const showClerkControls = process.env.NODE_ENV === "production" && !preview;

  const handleToggleSlot = (day: DayKey, hour: number) => {
    const key = slotKey(day, hour);
    const next = new Set(profile.availability);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    const availability = Array.from(next).sort();
    setData({
      ...data,
      profile: { ...profile, availability, status: "borrador" },
      teachers: data.teachers.map((teacher) =>
        teacher.id === profile.id
          ? { ...teacher, availability, status: "borrador" }
          : teacher,
      ),
    });
    request({ action: "setAvailability", availability });
  };

  const handleContractChange = (contract: ContractKey) => {
    request({ action: "setContract", contract });
  };

  const handleAddCourse = async () => {
    const course = courseCatalog.find((item) => item.id === courseId);
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
    await request({ action: "addCourse", courseId: course.id });
  };

  const handleRemoveCourse = async (id: string) => {
    await request({ action: "removeCourse", courseId: id });
  };

  const handleSubmit = async () => {
    if (!validation.complete) {
      toast.error("Aún faltan reglas por completar.");
      return;
    }
    await request({ action: "submit" });
    toast.success("Horario enviado para revisión.");
  };

  const handleExportXlsx = async () => {
    await exportXlsx(selectedTeacher);
    toast.success("Excel generado.");
  };

  const handleExportPdf = async () => {
    await exportPdf(selectedTeacher, selectedValidation);
    toast.success("PDF generado.");
  };

  return (
    <ScheduleFrame
      canSignOut={showClerkControls}
      canUseDirection={canUseDirection}
      completion={completion}
      currentRole={data.onboarding.role}
      selectedView={view}
      status={profile.status}
      userName={data.userName}
    >
      {view === "direccion" && canUseDirection ? (
        <DirectorView
          handleExportPdf={handleExportPdf}
          handleExportXlsx={handleExportXlsx}
          selectedTeacher={selectedTeacher}
          selectedTeacherId={selectedTeacher.id}
          setSelectedTeacherId={setSelectedTeacherId}
          setShowOnlyPending={setShowOnlyPending}
          showOnlyPending={showOnlyPending}
          teachers={filteredTeachers}
          validation={selectedValidation}
        />
      ) : view === "direccion" ? (
        <LockedDirectionView />
      ) : (
        <DocenteView
          catalogForSchool={catalogForSchool}
          courseId={courseId}
          handleAddCourse={handleAddCourse}
          handleContractChange={handleContractChange}
          handleRemoveCourse={handleRemoveCourse}
          handleSubmit={handleSubmit}
          handleToggleSlot={handleToggleSlot}
          profile={profile}
          saving={saving}
          school={school}
          setCourseId={setCourseId}
          setSchool={setSchool}
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
      toast.error("No se pudo guardar el perfil.");
      return;
    }
    router.push(next.role === "direccion" ? "/direccion" : "/docente");
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
      userEmail={data.profile.email}
    />
  );
}

function ScheduleFrame({
  canSignOut,
  canUseDirection,
  children,
  completion,
  currentRole,
  selectedView,
  status,
  userName,
}: {
  canSignOut: boolean;
  canUseDirection: boolean;
  children: React.ReactNode;
  completion: number;
  currentRole: AppRole;
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
            canUseDirection={canUseDirection}
            completion={completion}
            currentRole={currentRole}
            pendingCount={2}
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
                  <span>Semestre académico 2026.2</span>
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
                variant={status === "enviado" ? "default" : "secondary"}
                className="hidden sm:inline-flex"
              >
                {statusLabel(status)}
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
  canUseDirection,
  completion,
  currentRole,
  pendingCount,
  selectedView,
  userName,
}: {
  canSignOut: boolean;
  canUseDirection: boolean;
  completion: number;
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
            <SidebarMenuItem>
              {canUseDirection ? (
                <SidebarMenuButton
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                  isActive={selectedView === "direccion"}
                  render={<Link href="/direccion" />}
                  tooltip="Dirección"
                >
                  <Users />
                  <span>Dirección</span>
                </SidebarMenuButton>
              ) : (
                <SidebarMenuButton
                  aria-disabled
                  className="group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:size-9! group-data-[collapsible=icon]:rounded-xl"
                  disabled
                  tooltip="Disponible para directores"
                >
                  <LockKeyhole />
                  <span>Dirección</span>
                </SidebarMenuButton>
              )}
              {canUseDirection ? (
                <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator className="group-data-[collapsible=icon]:hidden" />
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Progreso</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3 px-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-sidebar-foreground/70">Docente</span>
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
    <main className="flex h-screen items-center justify-center bg-background text-foreground">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Spinner />
        <span>Cargando horarios institucionales</span>
      </div>
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
  userEmail,
}: {
  defaultSchool: string;
  onComplete: (next: Onboarding) => Promise<void>;
  userEmail?: string;
}) {
  const [role, setRole] = useState<AppRole>("docente");
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
    <section className="flex h-screen min-h-0 items-center justify-center overflow-hidden bg-background p-4 text-foreground md:p-6">
      <div className="grid h-full max-h-[720px] w-full max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="font-serif text-2xl">
                  Configura tu acceso institucional
                </CardTitle>
                <CardDescription>
                  Elige tu rol para activar la ruta correcta.
                </CardDescription>
              </div>
              <Badge variant="secondary">Onboarding</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid h-full min-h-0 gap-4 p-4 md:grid-cols-[1fr_1fr]">
            <Field>
              <FieldLabel>Rol en el proceso de horarios</FieldLabel>
              <FieldDescription>
                Docentes registran disponibilidad. Dirección revisa y exporta.
              </FieldDescription>
              <RadioGroup
                className="grid gap-3 pt-1"
                value={role}
                onValueChange={(value) => setRole(value as AppRole)}
              >
                <RoleChoice
                  checked={role === "docente"}
                  description="Registro de disponibilidad, cursos y envío a revisión."
                  icon={<CalendarClock className="size-4 text-gold" />}
                  label="Docente"
                  value="docente"
                />
                <RoleChoice
                  checked={role === "direccion"}
                  description="Panel de revisión, validación y exportación de docentes."
                  icon={<ShieldCheck className="size-4 text-gold" />}
                  label="Director o administrativo"
                  value="direccion"
                />
              </RadioGroup>
            </Field>
            <div className="space-y-4">
              <Field>
                <FieldLabel>Escuela profesional</FieldLabel>
                <Select value={school} onValueChange={setSchool}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecciona escuela" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel>Escuelas</SelectLabel>
                      {schools.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>Código o legajo</FieldLabel>
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="Ej. 082026"
                />
                <FieldDescription>
                  Se guarda en Neon y queda asociado a tu cuenta Clerk.
                </FieldDescription>
              </Field>
              <Alert variant="info">
                <Info />
                <AlertTitle>Cuenta detectada</AlertTitle>
                <AlertDescription>
                  {userEmail ?? "Correo institucional pendiente"}
                </AlertDescription>
              </Alert>
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
        <Card className="min-h-0 overflow-hidden bg-primary text-primary-foreground">
          <CardHeader className="p-4">
            <CardTitle className="font-serif text-2xl">Rutas por rol</CardTitle>
            <CardDescription className="text-primary-foreground/75">
              El sidebar abre rutas reales, no tabs acumulados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-4 text-sm">
            {[
              "/docente para disponibilidad y cursos.",
              "/direccion para revisión y exportación.",
              "Neon guarda perfil, cursos, estado y disponibilidad.",
              "Tema claro u oscuro desde el header.",
            ].map((item) => (
              <div className="flex items-center gap-2" key={item}>
                <Check className="size-4 text-gold" />
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function RoleChoice({
  checked,
  description,
  icon,
  label,
  value,
}: {
  checked: boolean;
  description: string;
  icon: React.ReactNode;
  label: string;
  value: AppRole;
}) {
  return (
    <Label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        checked ? "border-primary bg-accent" : "bg-card hover:bg-accent/60",
      )}
    >
      <Radio value={value} />
      <span className="flex min-w-0 flex-1 gap-3">
        <span className="mt-0.5">{icon}</span>
        <span>
          <span className="block font-medium">{label}</span>
          <span className="block text-muted-foreground text-sm">
            {description}
          </span>
        </span>
      </span>
    </Label>
  );
}

function DocenteView({
  catalogForSchool,
  courseId,
  handleAddCourse,
  handleContractChange,
  handleRemoveCourse,
  handleSubmit,
  handleToggleSlot,
  profile,
  saving,
  school,
  setCourseId,
  setSchool,
  validation,
}: {
  catalogForSchool: Course[];
  courseId: string;
  handleAddCourse: () => void;
  handleContractChange: (contract: ContractKey) => void;
  handleRemoveCourse: (id: string) => void;
  handleSubmit: () => void;
  handleToggleSlot: (day: DayKey, hour: number) => void;
  profile: TeacherProfile;
  saving: boolean;
  school: string;
  setCourseId: (id: string) => void;
  setSchool: (school: string) => void;
  validation: Validation;
}) {
  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3 xl:grid-cols-[minmax(0,1fr)_330px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="flex shrink-0 flex-col gap-2 border-b p-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <CardTitle className="truncate font-serif text-xl">
              Disponibilidad docente
            </CardTitle>
            <CardDescription className="truncate">
              Vista completa del horario 2026.2.
            </CardDescription>
          </div>
          <Toolbar className="shrink-0 border-0 bg-transparent p-0 shadow-none">
            <ToolbarGroup>
              <Select
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
                disabled={saving}
                onClick={handleSubmit}
                render={<Button />}
              >
                <Send data-icon="inline-start" />
                Enviar
              </ToolbarButton>
            </ToolbarGroup>
          </Toolbar>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-0">
          <ScheduleBoard
            availability={profile.availability}
            interactive
            onToggleSlot={handleToggleSlot}
          />
        </CardContent>
      </Card>
      <aside className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,1fr)_auto]">
        <CoursesEditorCard
          catalogForSchool={catalogForSchool}
          courseId={courseId}
          courses={profile.courses}
          handleAddCourse={handleAddCourse}
          handleRemoveCourse={handleRemoveCourse}
          school={school}
          setCourseId={setCourseId}
          setSchool={setSchool}
        />
        <TeacherStatusPanel
          onSubmit={handleSubmit}
          profile={profile}
          saving={saving}
          validation={validation}
        />
      </aside>
    </section>
  );
}

function CoursesEditorCard({
  catalogForSchool,
  courseId,
  courses,
  handleAddCourse,
  handleRemoveCourse,
  school,
  setCourseId,
  setSchool,
}: {
  catalogForSchool: Course[];
  courseId: string;
  courses: Course[];
  handleAddCourse: () => void;
  handleRemoveCourse: (id: string) => void;
  school: string;
  setCourseId: (id: string) => void;
  setSchool: (school: string) => void;
}) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="shrink-0 border-b p-2.5">
        <CardTitle className="truncate text-base">
          Cursos seleccionados
        </CardTitle>
        <CardDescription className="truncate">
          Carga permitida por contrato.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-2 p-2">
        <div className="grid gap-2">
          <Select value={school} onValueChange={setSchool}>
            <SelectTrigger className="w-full">
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
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Curso" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Curso</SelectLabel>
                  {catalogForSchool.map((course) => (
                    <SelectItem key={course.id} value={course.id}>
                      {course.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button onClick={handleAddCourse}>
              <Plus data-icon="inline-start" />
              Agregar
            </Button>
          </div>
        </div>
        <div className="min-h-0 overflow-hidden rounded-md border">
          <CoursesTable
            compact
            courses={courses}
            onRemoveCourse={handleRemoveCourse}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TeacherStatusPanel({
  onSubmit,
  profile,
  saving,
  validation,
}: {
  onSubmit: () => void;
  profile: TeacherProfile;
  saving?: boolean;
  validation: Validation;
}) {
  const rule = contractRules[profile.contract];
  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b p-2.5">
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
            <CardDescription>
              {rule.requiredHours} h · {rule.requiredBlockDays} bloques ·{" "}
              {rule.maxCourses} cursos
            </CardDescription>
          </div>
          <Badge variant={validation.complete ? "default" : "secondary"}>
            {validation.complete ? "Listo" : "Pendiente"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 p-2.5 text-sm">
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
            {profile.submittedAt
              ? `Último envío: ${profile.submittedAt}`
              : "Sin envío registrado"}
          </span>
          <Button size="sm" loading={saving} onClick={onSubmit}>
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
  handleExportPdf,
  handleExportXlsx,
  selectedTeacher,
  selectedTeacherId,
  setSelectedTeacherId,
  setShowOnlyPending,
  showOnlyPending,
  teachers,
  validation,
}: {
  handleExportPdf: () => Promise<void>;
  handleExportXlsx: () => Promise<void>;
  selectedTeacher: TeacherProfile;
  selectedTeacherId: string;
  setSelectedTeacherId: (id: string) => void;
  setShowOnlyPending: (value: boolean) => void;
  showOnlyPending: boolean;
  teachers: TeacherProfile[];
  validation: Validation;
}) {
  return (
    <section className="grid h-full min-h-0 gap-3 overflow-hidden p-3 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[280px_minmax(0,1fr)_320px]">
      <Card className="min-h-0 overflow-hidden">
        <CardHeader className="border-b p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                Lista de docentes
              </CardTitle>
              <CardDescription className="truncate">
                Revisión administrativa.
              </CardDescription>
            </div>
            <Badge variant="secondary">{teachers.length}</Badge>
          </div>
          <Field className="mt-3 flex-row items-center justify-between gap-3">
            <div>
              <FieldLabel className="text-xs">Solo pendientes</FieldLabel>
              <FieldDescription>Oculta enviados.</FieldDescription>
            </div>
            <Switch
              checked={showOnlyPending}
              onCheckedChange={setShowOnlyPending}
            />
          </Field>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 p-2">
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
                    <EmptyTitle>Sin docentes pendientes</EmptyTitle>
                    <EmptyDescription>
                      Desactiva el filtro para revisar enviados.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
      <div className="min-h-0">
        <Card className="h-full min-h-0 overflow-hidden">
          <CardHeader className="flex shrink-0 flex-col gap-2 border-b p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate font-serif text-xl">
                {selectedTeacher.name}
              </CardTitle>
              <CardDescription className="truncate">
                {contractRules[selectedTeacher.contract].label} ·{" "}
                {statusLabel(selectedTeacher.status)}
              </CardDescription>
            </div>
            <Toolbar className="shrink-0 border-0 bg-transparent p-0 shadow-none">
              <ToolbarGroup>
                <Sheet>
                  <SheetTrigger
                    render={<Button variant="outline" className="2xl:hidden" />}
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
                    <SheetPanel className="grid gap-3 p-3">
                      <CoursesReviewCard courses={selectedTeacher.courses} />
                      <RulePanel
                        profile={selectedTeacher}
                        validation={validation}
                      />
                    </SheetPanel>
                  </SheetContent>
                </Sheet>
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
            <ScheduleBoard availability={selectedTeacher.availability} />
          </CardContent>
        </Card>
      </div>
      <aside className="hidden min-h-0 gap-3 2xl:grid 2xl:grid-rows-[minmax(0,1fr)_auto]">
        <CoursesReviewCard courses={selectedTeacher.courses} />
        <RulePanel profile={selectedTeacher} validation={validation} />
      </aside>
    </section>
  );
}

function CoursesReviewCard({ courses }: { courses: Course[] }) {
  return (
    <Card className="min-h-0 overflow-hidden">
      <CardHeader className="shrink-0 border-b p-3">
        <CardTitle className="text-base">Cursos del docente</CardTitle>
        <CardDescription>
          Cursos asociados al horario seleccionado.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 p-0">
        <CoursesTable compact courses={courses} />
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
          La vista de Dirección está disponible para usuarios con rol director o
          administrativo.
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
        "flex h-[68px] w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition-colors",
        selected ? "border-primary bg-accent" : "bg-card hover:bg-accent/60",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-muted-foreground tabular-nums">{index + 1}</span>
        <span className="min-w-0">
          <span className="block truncate font-medium">{teacher.name}</span>
          <span className="block truncate text-muted-foreground text-xs">
            {teacher.email}
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
  interactive = false,
  onToggleSlot,
}: {
  availability: string[];
  interactive?: boolean;
  onToggleSlot?: (day: DayKey, hour: number) => void;
}) {
  const selected = useMemo(() => new Set(availability), [availability]);

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden">
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
                return (
                  <Cell
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
      <CardHeader className="space-y-1 p-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4 text-gold" />
          Reglas activas
        </CardTitle>
        <CardDescription>{rule.text}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-3 pt-0 text-sm">
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

function CoursesTable({
  compact = false,
  courses,
  onRemoveCourse,
}: {
  compact?: boolean;
  courses: Course[];
  onRemoveCourse?: (id: string) => void;
}) {
  if (!courses.length) {
    return (
      <Empty className="h-full py-8">
        <EmptyMedia variant="icon">
          <BookOpen />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Sin cursos</EmptyTitle>
          <EmptyDescription>
            Agrega un curso para habilitar la validación.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent />
      </Empty>
    );
  }

  return (
    <ScrollArea scrollbarGutter>
      <Table className={compact ? "text-xs" : undefined}>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow className={compact ? "h-8" : "h-9"}>
            <TableHead className={cn(compact ? "h-8 w-10 px-1.5" : "w-14")}>
              N°
            </TableHead>
            <TableHead className={compact ? "h-8 px-1.5" : undefined}>
              Curso
            </TableHead>
            <TableHead className={compact ? "h-8 px-1.5" : undefined}>
              Escuela Profesional
            </TableHead>
            {onRemoveCourse ? (
              <TableHead className={compact ? "h-8 w-8 px-1" : "w-14"} />
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {courses.map((course, index) => (
            <TableRow className={compact ? "h-8" : "h-10"} key={course.id}>
              <TableCell
                className={cn(
                  "text-muted-foreground tabular-nums",
                  compact && "px-1.5 py-1",
                )}
              >
                {index + 1}
              </TableCell>
              <TableCell
                className={cn("font-medium", compact && "px-1.5 py-1")}
              >
                {course.name}
                {course.isThesis ? (
                  <Badge variant="secondary" className="ml-2">
                    Tesis
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell className={compact ? "px-1.5 py-1" : undefined}>
                {course.school}
              </TableCell>
              {onRemoveCourse ? (
                <TableCell className={compact ? "px-1 py-0.5" : undefined}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size={compact ? "icon-xs" : "icon"}
                          onClick={() => onRemoveCourse(course.id)}
                        />
                      }
                    >
                      <Trash2 data-icon="inline-start" />
                      <span className="sr-only">Quitar curso</span>
                    </TooltipTrigger>
                    <TooltipContent>Quitar curso</TooltipContent>
                  </Tooltip>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  );
}

function validateTeacher(profile: TeacherProfile): Validation {
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

function completionFor(profile: TeacherProfile, validation: Validation) {
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

function statusLabel(status: TeacherProfile["status"]) {
  if (status === "enviado") {
    return "Enviado";
  }
  if (status === "observado") {
    return "Observado";
  }
  return "Borrador";
}

function roleLabel(role: AppRole) {
  return role === "direccion" ? "Dirección" : "Docente";
}

function routeLabel(view: ViewKey) {
  return view === "direccion" ? "Dirección" : "Docente";
}

async function exportXlsx(profile: TeacherProfile) {
  const XLSX = await import("xlsx");
  const rows = buildExportRows(profile);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Disponibilidad");
  XLSX.writeFile(
    workbook,
    `horario-${profile.name.toLowerCase().replaceAll(" ", "-")}.xlsx`,
  );
}

async function exportPdf(profile: TeacherProfile, validation: Validation) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(16);
  doc.text(`Horario 2026.2 - ${profile.name}`, 14, 16);
  doc.setFontSize(10);
  doc.text(
    `${contractRules[profile.contract].label} - ${statusLabel(profile.status)}`,
    14,
    24,
  );
  autoTable(doc, {
    startY: 32,
    head: [["Día", "Hora", "Disponible"]],
    body: buildExportRows(profile).map((row) => [
      row.Dia,
      row.Hora,
      row.Disponible,
    ]),
  });
  autoTable(doc, {
    startY: 32,
    margin: { left: 190 },
    head: [["Curso", "Escuela"]],
    body: profile.courses.map((course) => [course.name, course.school]),
  });
  doc.text(
    `Horas: ${validation.selectedHours} - Bloques 4 h: ${validation.blockDays} - Cursos: ${validation.countedCourses}`,
    14,
    194,
  );
  doc.save(`horario-${profile.name.toLowerCase().replaceAll(" ", "-")}.pdf`);
}

function buildExportRows(profile: TeacherProfile) {
  const selected = new Set(profile.availability);
  return days.flatMap((day) =>
    hours.map((hour) => ({
      Dia: day.label,
      Hora: formatHour(hour),
      Disponible: selected.has(slotKey(day.key, hour)) ? "Sí" : "No",
    })),
  );
}

export function SignedOutShell() {
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background p-4 text-foreground md:p-6">
      <section className="grid h-full max-h-[720px] w-full max-w-5xl gap-4 md:grid-cols-[1fr_400px]">
        <div className="flex min-h-0 flex-col justify-between rounded-lg border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Image
              src="/escudo-unmsm.png"
              alt="Escudo UNMSM"
              width={52}
              height={52}
              className="rounded-md bg-vellum p-1"
              priority
            />
            <div>
              <p className="text-gold text-xs font-semibold uppercase tracking-[0.18em]">
                UNMSM
              </p>
              <h1 className="font-serif text-3xl font-semibold">
                Horarios UNMSM
              </h1>
            </div>
          </div>
          <div className="flex flex-col gap-4">
            <p className="max-w-xl text-muted-foreground">
              Plataforma para docentes, dirección académica y administrativos.
              Registro, validación y exportación con persistencia institucional.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Clerk roles", "Neon Postgres", "PDF/XLSX"].map((item) => (
                <div
                  className="rounded-lg border bg-background p-3 text-sm"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <Card className="self-center">
          <CardHeader>
            <CardTitle>Ingreso</CardTitle>
            <CardDescription>
              Accede con tu correo para registrar o revisar horarios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              <SignInButton mode="modal">
                <Button className="w-full">
                  <GraduationCap data-icon="inline-start" />
                  Iniciar sesión
                </Button>
              </SignInButton>
              <a
                className={cn(buttonVariants({ variant: "outline" }), "w-full")}
                href="/sign-up"
              >
                Solicitar acceso
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
