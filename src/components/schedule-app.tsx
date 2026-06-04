"use client";

import {
  SignInButton,
  SignOutButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import {
  AlertCircle,
  ArrowDownToLine,
  BookOpen,
  CalendarClock,
  Check,
  ChevronRight,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  Home,
  Info,
  LockKeyhole,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import Image from "next/image";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
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
  seedTeachers,
  slotKey,
  type TeacherProfile,
} from "@/lib/schedule-data";
import { cn } from "@/lib/utils";

const storageKey = "horarios-unmsm-state-v2";

type AppRole = "docente" | "direccion";
type ViewKey = "docente" | "direccion";

type Onboarding = {
  role: AppRole;
  school: string;
  code: string;
  complete: boolean;
};

type LocalState = {
  profile: TeacherProfile;
  onboarding?: Onboarding;
};

type Validation = {
  selectedHours: number;
  countedCourses: number;
  blockDays: number;
  complete: boolean;
};

type ClerkScheduleMetadata = {
  horariosRole?: AppRole;
  horariosSchool?: string;
  horariosCode?: string;
};

type ScheduleUser = {
  firstName?: string | null;
  fullName?: string | null;
  primaryEmailAddress?: { emailAddress: string } | null;
  publicMetadata?: Record<string, unknown>;
  unsafeMetadata?: Record<string, unknown>;
  update?: (params: {
    unsafeMetadata: Record<string, unknown>;
  }) => Promise<unknown>;
};

const demoOnboarding: Onboarding = {
  role: "direccion",
  school: schools[0],
  code: "DEMO-2026",
  complete: true,
};

export function ScheduleApp({ demo = false }: { demo?: boolean }) {
  if (demo) {
    return <ScheduleExperience demo isLoaded user={null} />;
  }
  return <AuthenticatedScheduleApp />;
}

function AuthenticatedScheduleApp() {
  const { isLoaded, user } = useUser();
  return <ScheduleExperience demo={false} isLoaded={isLoaded} user={user} />;
}

function ScheduleExperience({
  demo,
  isLoaded,
  user,
}: {
  demo: boolean;
  isLoaded: boolean;
  user: ScheduleUser | null | undefined;
}) {
  const [profile, setProfile] = useState<TeacherProfile>(seedTeachers[0]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("me");
  const [school, setSchool] = useState(schools[0]);
  const [courseId, setCourseId] = useState(courseCatalog[0].id);
  const [activeView, setActiveView] = useState<ViewKey>("docente");
  const [showOnlyPending, setShowOnlyPending] = useState(false);
  const [onboarding, setOnboarding] = useState<Onboarding | undefined>(
    demo ? demoOnboarding : undefined,
  );

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as LocalState;
      setProfile(parsed.profile);
      if (parsed.onboarding?.complete) {
        setOnboarding(parsed.onboarding);
        setActiveView(parsed.onboarding.role);
      }
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    if (demo || !isLoaded || !user || onboarding?.complete) {
      return;
    }
    const metadata = {
      ...user.publicMetadata,
      ...user.unsafeMetadata,
    } as ClerkScheduleMetadata;
    if (metadata.horariosRole && isRole(metadata.horariosRole)) {
      const next = {
        role: metadata.horariosRole,
        school: metadata.horariosSchool ?? schools[0],
        code: metadata.horariosCode ?? "",
        complete: true,
      };
      setOnboarding(next);
      setActiveView(next.role);
    }
  }, [demo, isLoaded, onboarding?.complete, user]);

  useEffect(() => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ onboarding, profile }),
    );
  }, [onboarding, profile]);

  const displayProfile = useMemo<TeacherProfile>(
    () => ({
      ...profile,
      email:
        user?.primaryEmailAddress?.emailAddress ??
        (demo ? profile.email : profile.email),
      name: user?.fullName ?? user?.firstName ?? profile.name,
    }),
    [demo, profile, user],
  );

  const allTeachers = useMemo(
    () => [displayProfile, ...seedTeachers.slice(1)],
    [displayProfile],
  );
  const filteredTeachers = useMemo(
    () =>
      showOnlyPending
        ? allTeachers.filter((teacher) => teacher.status !== "enviado")
        : allTeachers,
    [allTeachers, showOnlyPending],
  );
  const selectedTeacher = useMemo(() => {
    if (selectedTeacherId === "me") {
      return displayProfile;
    }
    return (
      allTeachers.find((teacher) => teacher.id === selectedTeacherId) ??
      displayProfile
    );
  }, [allTeachers, displayProfile, selectedTeacherId]);
  const validation = useMemo(
    () => validateTeacher(displayProfile),
    [displayProfile],
  );
  const selectedValidation = useMemo(
    () => validateTeacher(selectedTeacher),
    [selectedTeacher],
  );
  const catalogForSchool = useMemo(
    () =>
      courseCatalog.filter(
        (course) => course.school === school || course.school === "Transversal",
      ),
    [school],
  );
  const effectiveRole = onboarding?.complete ? onboarding.role : "docente";
  const canUseDirection = effectiveRole === "direccion";
  const needsOnboarding = !demo && isLoaded && Boolean(user) && !onboarding;
  const completion = Math.min(
    100,
    Math.round(
      (validation.selectedHours /
        contractRules[displayProfile.contract].requiredHours) *
        70 +
        (validation.blockDays /
          contractRules[displayProfile.contract].requiredBlockDays) *
          20 +
        (validation.countedCourses /
          contractRules[displayProfile.contract].maxCourses) *
          10,
    ),
  );

  useEffect(() => {
    if (!canUseDirection && activeView === "direccion") {
      setActiveView("docente");
    }
  }, [activeView, canUseDirection]);

  const handleToggleSlot = (day: DayKey, hour: number) => {
    const key = slotKey(day, hour);
    setProfile((current) => {
      const next = new Set(current.availability);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return {
        ...current,
        availability: Array.from(next).sort(),
        status: "borrador",
      };
    });
  };

  const handleContractChange = (contract: ContractKey) => {
    setProfile((current) => ({
      ...current,
      contract,
      status: "borrador",
    }));
  };

  const handleAddCourse = () => {
    const course = courseCatalog.find((item) => item.id === courseId);
    if (!course) {
      return;
    }
    const alreadySelected = profile.courses.some(
      (item) => item.id === course.id,
    );
    if (alreadySelected) {
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
    setProfile((current) => ({
      ...current,
      courses: [...current.courses, course],
      status: "borrador",
    }));
  };

  const handleRemoveCourse = (id: string) => {
    setProfile((current) => ({
      ...current,
      courses: current.courses.filter((course) => course.id !== id),
      status: "borrador",
    }));
  };

  const handleSubmit = () => {
    if (!validation.complete) {
      toast.error("Aún faltan reglas por completar.");
      return;
    }
    const submittedAt = new Intl.DateTimeFormat("es-PE", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
    setProfile((current) => ({
      ...current,
      status: "enviado",
      submittedAt,
    }));
    toast.success("Horario enviado para revisión.");
  };

  const handleOnboardingComplete = async (next: Onboarding) => {
    setOnboarding(next);
    setSchool(next.school);
    setActiveView(next.role);
    if (!demo && user?.update) {
      try {
        await user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            horariosCode: next.code,
            horariosRole: next.role,
            horariosSchool: next.school,
          },
        });
      } catch {
        toast.warning("Rol guardado localmente. Clerk no aceptó la metadata.");
      }
    }
    toast.success("Perfil institucional listo.");
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
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
        <Sidebar collapsible="icon" className="border-sidebar-border">
          <AppSidebar
            canSignOut={!demo && Boolean(user)}
            canUseDirection={canUseDirection}
            completion={completion}
            currentRole={effectiveRole}
            onNavigate={setActiveView}
            pendingCount={
              allTeachers.filter((teacher) => teacher.status !== "enviado")
                .length
            }
            roleIsReady={Boolean(onboarding?.complete)}
            selectedView={activeView}
            userName={user?.firstName ?? (demo ? "Modo demo" : "Docente")}
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
                  <span className="truncate">
                    {activeView === "direccion" ? "Dirección" : "Docente"}
                  </span>
                </div>
                <h1 className="truncate font-serif text-lg font-semibold md:text-xl">
                  Horarios UNMSM
                </h1>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant={
                  displayProfile.status === "enviado" ? "default" : "secondary"
                }
                className="hidden sm:inline-flex"
              >
                {statusLabel(displayProfile.status)}
              </Badge>
              {onboarding?.complete ? (
                <Badge variant="outline" className="hidden md:inline-flex">
                  {roleLabel(onboarding.role)}
                </Badge>
              ) : null}
              {user ? <UserButton /> : null}
            </div>
          </header>
          <div className="min-h-0 flex-1 overflow-hidden bg-background">
            {needsOnboarding ? (
              <OnboardingView
                defaultSchool={school}
                onComplete={handleOnboardingComplete}
                userEmail={user?.primaryEmailAddress?.emailAddress}
              />
            ) : activeView === "direccion" && canUseDirection ? (
              <DirectorView
                handleExportPdf={handleExportPdf}
                handleExportXlsx={handleExportXlsx}
                selectedTeacher={selectedTeacher}
                selectedTeacherId={selectedTeacherId}
                setSelectedTeacherId={setSelectedTeacherId}
                setShowOnlyPending={setShowOnlyPending}
                showOnlyPending={showOnlyPending}
                teachers={filteredTeachers}
                validation={selectedValidation}
              />
            ) : (
              <DocenteView
                catalogForSchool={catalogForSchool}
                courseId={courseId}
                handleAddCourse={handleAddCourse}
                handleContractChange={handleContractChange}
                handleRemoveCourse={handleRemoveCourse}
                handleSubmit={handleSubmit}
                handleToggleSlot={handleToggleSlot}
                profile={displayProfile}
                school={school}
                setCourseId={setCourseId}
                setSchool={setSchool}
                validation={validation}
              />
            )}
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
  onNavigate,
  pendingCount,
  roleIsReady,
  selectedView,
  userName,
}: {
  canSignOut: boolean;
  canUseDirection: boolean;
  completion: number;
  currentRole: AppRole;
  onNavigate: (view: ViewKey) => void;
  pendingCount: number;
  roleIsReady: boolean;
  selectedView: ViewKey;
  userName: string;
}) {
  return (
    <>
      <SidebarHeader className="border-sidebar-border border-b p-3">
        <div className="flex items-center gap-3 rounded-lg px-1 py-1">
          <Image
            src="/escudo-unmsm.png"
            alt="Escudo UNMSM"
            width={40}
            height={40}
            className="rounded-md bg-vellum p-1"
            priority
          />
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
        <SidebarGroup>
          <SidebarGroupLabel>Sesión</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-2 px-2 group-data-[collapsible=icon]:hidden">
            <p className="truncate font-medium text-sidebar-foreground">
              {userName}
            </p>
            <p className="text-sidebar-foreground/70 text-xs">
              {roleIsReady
                ? roleLabel(currentRole)
                : "Perfil institucional pendiente"}
            </p>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Trabajo</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={selectedView === "docente"}
                onClick={() => onNavigate("docente")}
                tooltip="Docente"
              >
                <CalendarClock />
                <span>Docente</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-disabled={!canUseDirection}
                disabled={!canUseDirection}
                isActive={selectedView === "direccion"}
                onClick={() => onNavigate("direccion")}
                tooltip={
                  canUseDirection ? "Dirección" : "Disponible para directores"
                }
              >
                {canUseDirection ? <Users /> : <LockKeyhole />}
                <span>Dirección</span>
              </SidebarMenuButton>
              {canUseDirection ? (
                <SidebarMenuBadge>{pendingCount}</SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarSeparator />
        <SidebarGroup>
          <SidebarGroupLabel>Progreso</SidebarGroupLabel>
          <SidebarGroupContent className="space-y-3 px-2 group-data-[collapsible=icon]:hidden">
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
    <section className="flex h-full min-h-0 items-center justify-center overflow-hidden p-4 md:p-6">
      <div className="grid h-full max-h-[720px] w-full max-w-6xl gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-h-0 overflow-hidden">
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="font-serif text-2xl">
                  Configura tu acceso institucional
                </CardTitle>
                <CardDescription>
                  Elige tu rol para activar la experiencia correcta.
                </CardDescription>
              </div>
              <Badge variant="secondary">Onboarding</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid h-full min-h-0 gap-4 p-4 md:grid-cols-[1fr_1fr]">
            <div className="space-y-4">
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
            </div>
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
                  Se guarda en Clerk como metadata de usuario.
                </FieldDescription>
              </Field>
              <Alert variant="info">
                <Info />
                <AlertTitle>Cuenta detectada</AlertTitle>
                <AlertDescription>
                  {userEmail ?? "Correo institucional pendiente de Clerk"}
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
          <CardHeader>
            <CardTitle className="font-serif text-2xl">
              Flujo listo para producción
            </CardTitle>
            <CardDescription className="text-primary-foreground/75">
              El rol desbloquea navegación, permisos y validaciones.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {[
              "Onboarding persistido en Clerk y localStorage.",
              "Dirección queda bloqueado para usuarios docentes.",
              "La UI mantiene pantalla completa sin scroll global.",
              "Los exports se ejecutan desde el rol autorizado.",
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
  school: string;
  setCourseId: (id: string) => void;
  setSchool: (school: string) => void;
  validation: Validation;
}) {
  const rule = contractRules[profile.contract];

  return (
    <section className="grid h-full min-h-0 gap-3 overflow-auto p-3 md:p-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:overflow-hidden">
      <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,1fr)_240px]">
        <Card className="h-[560px] min-h-0 overflow-hidden xl:h-auto">
          <CardHeader className="flex shrink-0 flex-col gap-3 border-b bg-card px-4 py-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate font-serif text-xl">
                Disponibilidad docente
              </CardTitle>
              <CardDescription className="truncate">
                Marca bloques y cumple las reglas de tu clase docente.
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
                <ToolbarButton onClick={handleSubmit} render={<Button />}>
                  <Send data-icon="inline-start" />
                  Enviar
                </ToolbarButton>
              </ToolbarGroup>
            </Toolbar>
          </CardHeader>
          <CardContent className="h-[calc(100%-73px)] min-h-0 p-0">
            <ScheduleBoard
              availability={profile.availability}
              interactive
              onToggleSlot={handleToggleSlot}
            />
          </CardContent>
        </Card>
        <Card className="h-[280px] min-h-0 overflow-hidden xl:h-auto">
          <CardHeader className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                Cursos seleccionados
              </CardTitle>
              <CardDescription className="truncate">
                Escuela, curso y carga permitida por contrato.
              </CardDescription>
            </div>
            <div className="grid shrink-0 gap-2 md:grid-cols-[170px_220px_auto]">
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
          </CardHeader>
          <CardContent className="h-[calc(100%-73px)] min-h-0 p-0">
            <CoursesTable
              courses={profile.courses}
              onRemoveCourse={handleRemoveCourse}
            />
          </CardContent>
        </Card>
      </div>
      <aside className="min-h-0 overflow-hidden">
        <ScrollArea scrollFade scrollbarGutter>
          <div className="flex min-h-full flex-col gap-3">
            <RulePanel profile={profile} validation={validation} />
            <Card>
              <CardHeader className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ClipboardCheck className="size-4 text-gold" />
                  Cierre de revisión
                </CardTitle>
                <CardDescription>
                  Resumen antes de enviar a Dirección.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <MetricRow
                  label="Horas marcadas"
                  value={`${validation.selectedHours}/${rule.requiredHours}`}
                />
                <MetricRow
                  label="Días con bloque de 4 h"
                  value={`${validation.blockDays}/${rule.requiredBlockDays}`}
                />
                <MetricRow
                  label="Cursos contados"
                  value={`${validation.countedCourses}/${rule.maxCourses}`}
                />
                <Separator />
                <p className="text-muted-foreground">
                  {profile.submittedAt
                    ? `Último envío: ${profile.submittedAt}`
                    : "Aún no se registró un envío."}
                </p>
              </CardContent>
            </Card>
            <Alert variant={validation.complete ? "success" : "warning"}>
              {validation.complete ? <ShieldCheck /> : <AlertCircle />}
              <AlertTitle>
                {validation.complete ? "Listo para enviar" : "Faltan reglas"}
              </AlertTitle>
              <AlertDescription>
                {validation.complete
                  ? "La disponibilidad cumple con las reglas configuradas."
                  : "Completa horas, bloques y cursos antes de enviar."}
              </AlertDescription>
              <AlertAction>
                <Button size="sm" onClick={handleSubmit}>
                  Enviar
                </Button>
              </AlertAction>
            </Alert>
          </div>
        </ScrollArea>
      </aside>
    </section>
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
    <section className="grid h-full min-h-0 gap-3 overflow-auto p-3 md:p-4 xl:grid-cols-[320px_minmax(0,1fr)] xl:overflow-hidden">
      <Card className="h-[394px] min-h-0 overflow-hidden xl:h-auto">
        <CardHeader className="border-b px-4 py-3">
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
        <CardContent className="h-[calc(100%-133px)] min-h-0 p-2">
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
      <div className="grid min-h-0 gap-3 xl:grid-rows-[minmax(0,1fr)_238px]">
        <Card className="h-[500px] min-h-0 overflow-hidden xl:h-auto">
          <CardHeader className="flex shrink-0 flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
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
          <CardContent className="h-[calc(100%-73px)] min-h-0 p-0">
            <ScheduleBoard availability={selectedTeacher.availability} />
          </CardContent>
        </Card>
        <div className="grid min-h-0 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card className="h-[280px] min-h-0 overflow-hidden xl:h-auto">
            <CardHeader className="border-b px-4 py-3">
              <CardTitle className="text-base">Cursos del docente</CardTitle>
              <CardDescription>
                Vista administrativa para validación.
              </CardDescription>
            </CardHeader>
            <CardContent className="h-[calc(100%-73px)] min-h-0 p-0">
              <CoursesTable courses={selectedTeacher.courses} />
            </CardContent>
          </Card>
          <RulePanel
            profile={selectedTeacher}
            validation={validation}
            compact
          />
        </div>
      </div>
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
        "flex h-[76px] w-full items-center justify-between gap-3 rounded-lg border px-3 text-left text-sm transition-colors",
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
    <ScrollArea scrollbarGutter>
      <div className="min-w-[820px]">
        <div className="sticky top-0 z-10 grid grid-cols-[104px_repeat(6,minmax(110px,1fr))] border-b bg-primary text-primary-foreground text-sm">
          <div className="border-r p-3 font-medium">Hora</div>
          {days.map((day) => (
            <div
              className="border-r p-3 text-center font-medium last:border-r-0"
              key={day.key}
            >
              {day.label}
            </div>
          ))}
        </div>
        {hours.map((hour) => (
          <div
            className="grid grid-cols-[104px_repeat(6,minmax(110px,1fr))] border-b last:border-b-0"
            key={hour}
          >
            <div className="flex min-h-10 items-center justify-center border-r bg-muted/55 px-2 text-center font-medium text-xs tabular-nums">
              {formatHour(hour)}
            </div>
            {days.map((day) => {
              const key = slotKey(day.key, hour);
              const isSelected = selected.has(key);
              const Cell = interactive ? "button" : "div";
              return (
                <Cell
                  className={cn(
                    "flex min-h-10 items-center justify-center border-r text-xs transition-colors last:border-r-0",
                    isSelected
                      ? "bg-availability text-primary-foreground"
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
    </ScrollArea>
  );
}

function RulePanel({
  compact = false,
  profile,
  validation,
}: {
  compact?: boolean;
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
    <Card className={cn("min-h-0 overflow-hidden", compact && "h-full")}>
      <CardHeader className="space-y-1 px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Info className="size-4 text-gold" />
          Reglas activas
        </CardTitle>
        <CardDescription>{rule.text}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-4 pb-4 text-sm">
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
  courses,
  onRemoveCourse,
}: {
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
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-card">
          <TableRow>
            <TableHead className="w-14">N°</TableHead>
            <TableHead>Curso</TableHead>
            <TableHead>Escuela Profesional</TableHead>
            {onRemoveCourse ? <TableHead className="w-14" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {courses.map((course, index) => (
            <TableRow key={course.id}>
              <TableCell className="text-muted-foreground tabular-nums">
                {index + 1}
              </TableCell>
              <TableCell className="font-medium">
                {course.name}
                {course.isThesis ? (
                  <Badge variant="secondary" className="ml-2">
                    Tesis
                  </Badge>
                ) : null}
              </TableCell>
              <TableCell>{course.school}</TableCell>
              {onRemoveCourse ? (
                <TableCell>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
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

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
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

function isRole(value: string): value is AppRole {
  return value === "docente" || value === "direccion";
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
              Registro, validación y exportación en una sola pantalla.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {["Clerk roles", "Reglas por contrato", "PDF/XLSX"].map(
                (item) => (
                  <div
                    className="rounded-lg border bg-background p-3 text-sm"
                    key={item}
                  >
                    {item}
                  </div>
                ),
              )}
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
                href="/demo"
              >
                Probar demo
              </a>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
