"use client";

import {
  SignInButton,
  SignOutButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import {
  ArrowDownToLine,
  CalendarClock,
  Check,
  ClipboardCheck,
  FileSpreadsheet,
  GraduationCap,
  Info,
  PanelLeft,
  Plus,
  Send,
  Trash2,
  Users,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const storageKey = "horarios-unmsm-state-v1";

type LocalState = {
  profile: TeacherProfile;
};

type Validation = {
  selectedHours: number;
  countedCourses: number;
  blockDays: number;
  complete: boolean;
};

export function ScheduleApp({ demo = false }: { demo?: boolean }) {
  const { user } = useUser();
  const [profile, setProfile] = useState<TeacherProfile>(seedTeachers[0]);
  const [selectedTeacherId, setSelectedTeacherId] = useState("me");
  const [school, setSchool] = useState(schools[0]);
  const [courseId, setCourseId] = useState(courseCatalog[0].id);
  const [role, setRole] = useState("docente");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return;
    }
    try {
      const parsed = JSON.parse(raw) as LocalState;
      setProfile(parsed.profile);
    } catch {
      window.localStorage.removeItem(storageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify({ profile }));
  }, [profile]);

  const selectedTeacher = useMemo(() => {
    if (selectedTeacherId === "me") {
      return profile;
    }
    return (
      seedTeachers.find((teacher) => teacher.id === selectedTeacherId) ??
      profile
    );
  }, [profile, selectedTeacherId]);

  const validation = useMemo(() => validateTeacher(profile), [profile]);
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
  const allTeachers = useMemo(
    () => [profile, ...seedTeachers.slice(1)],
    [profile],
  );
  const completion = Math.min(
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

  const handleExportXlsx = async () => {
    await exportXlsx(selectedTeacher);
    toast.success("Excel generado.");
  };

  const handleExportPdf = async () => {
    await exportPdf(selectedTeacher, selectedValidation);
    toast.success("PDF generado.");
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-sidebar-border border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
          <SidebarContent
            canSignOut={!demo && Boolean(user)}
            completion={completion}
            role={role}
            setRole={setRole}
            userName={user?.firstName ?? (demo ? "Modo demo" : "Docente")}
          />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden">
                    <PanelLeft data-icon="inline-start" />
                    <span className="sr-only">Abrir navegación</span>
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-80 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
                >
                  <SheetHeader className="sr-only">
                    <SheetTitle>Navegación</SheetTitle>
                    <SheetDescription>
                      Menú principal de Horarios UNMSM
                    </SheetDescription>
                  </SheetHeader>
                  <SidebarContent
                    canSignOut={!demo && Boolean(user)}
                    completion={completion}
                    role={role}
                    setRole={(value) => {
                      setRole(value);
                      setMobileOpen(false);
                    }}
                    userName={
                      user?.firstName ?? (demo ? "Modo demo" : "Docente")
                    }
                  />
                </SheetContent>
              </Sheet>
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">
                  Semestre académico 2026.2
                </p>
                <h1 className="truncate font-serif text-xl font-semibold md:text-2xl">
                  Horarios UNMSM
                </h1>
              </div>
            </div>
            {user ? (
              <div className="flex items-center gap-3">
                <Badge
                  variant={
                    profile.status === "enviado" ? "default" : "secondary"
                  }
                >
                  {statusLabel(profile.status)}
                </Badge>
                <UserButton />
              </div>
            ) : null}
          </header>
          <Tabs value={role} onValueChange={setRole} className="flex-1">
            <div className="border-b bg-card px-4 py-2 md:px-6 lg:hidden">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="docente">Docente</TabsTrigger>
                <TabsTrigger value="direccion">Dirección</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="docente" className="m-0">
              <DocenteView
                catalogForSchool={catalogForSchool}
                courseId={courseId}
                handleAddCourse={handleAddCourse}
                handleContractChange={handleContractChange}
                handleRemoveCourse={handleRemoveCourse}
                handleSubmit={handleSubmit}
                handleToggleSlot={handleToggleSlot}
                profile={profile}
                school={school}
                setCourseId={setCourseId}
                setSchool={setSchool}
                validation={validation}
              />
            </TabsContent>
            <TabsContent value="direccion" className="m-0">
              <DirectorView
                handleExportPdf={handleExportPdf}
                handleExportXlsx={handleExportXlsx}
                selectedTeacher={selectedTeacher}
                selectedTeacherId={selectedTeacherId}
                setSelectedTeacherId={setSelectedTeacherId}
                teachers={allTeachers}
                validation={selectedValidation}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}

function SidebarContent({
  canSignOut,
  completion,
  role,
  setRole,
  userName,
}: {
  canSignOut: boolean;
  completion: number;
  role: string;
  setRole: (value: string) => void;
  userName: string;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-sidebar-border border-b p-5">
        <Image
          src="/escudo-unmsm.png"
          alt="Escudo UNMSM"
          width={44}
          height={44}
          className="rounded-md bg-vellum p-1"
          priority
        />
        <div className="min-w-0">
          <p className="text-gold text-xs font-semibold uppercase tracking-[0.18em]">
            UNMSM
          </p>
          <p className="truncate font-serif text-lg font-semibold">Horarios</p>
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-5 p-5">
        <div className="flex flex-col gap-2">
          <p className="text-sidebar-foreground/70 text-xs">Sesión activa</p>
          <p className="font-medium">{userName}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            variant={role === "docente" ? "secondary" : "ghost"}
            className="justify-start text-sidebar-foreground"
            onClick={() => setRole("docente")}
          >
            <CalendarClock data-icon="inline-start" />
            Docente
          </Button>
          <Button
            variant={role === "direccion" ? "secondary" : "ghost"}
            className="justify-start text-sidebar-foreground"
            onClick={() => setRole("direccion")}
          >
            <Users data-icon="inline-start" />
            Dirección
          </Button>
        </div>
        <Separator className="bg-sidebar-border" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-sidebar-foreground/70">Progreso docente</span>
            <span className="text-gold font-medium">{completion}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-sidebar-accent">
            <div
              className="h-full bg-gold"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>
      </div>
      {canSignOut ? (
        <div className="border-sidebar-border border-t p-5">
          <SignOutButton>
            <Button
              variant="outline"
              className="w-full border-sidebar-border bg-transparent text-sidebar-foreground"
            >
              Cerrar sesión
            </Button>
          </SignOutButton>
        </div>
      ) : null}
    </div>
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
    <section className="grid gap-4 p-4 md:p-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-3 border-b bg-card md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-serif text-2xl">
                Disponibilidad docente
              </CardTitle>
              <CardDescription>
                Marca bloques horarios y valida las reglas de tu clase docente.
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={profile.contract}
                onValueChange={handleContractChange}
              >
                <SelectTrigger className="w-[210px]">
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
              <Button onClick={handleSubmit}>
                <Send data-icon="inline-start" />
                Enviar horario
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScheduleGrid
              availability={profile.availability}
              interactive
              onToggleSlot={handleToggleSlot}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Cursos seleccionados</CardTitle>
            <CardDescription>
              Los cursos se listan en el orden en que fueron adicionados.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Select value={school} onValueChange={setSchool}>
                <SelectTrigger>
                  <SelectValue placeholder="Escuela profesional" />
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
                <SelectTrigger>
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
                Adicionar curso
              </Button>
            </div>
            <CoursesTable
              courses={profile.courses}
              onRemoveCourse={handleRemoveCourse}
            />
          </CardContent>
        </Card>
      </div>
      <aside className="flex flex-col gap-4">
        <RulePanel profile={profile} validation={validation} />
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
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
  teachers,
  validation,
}: {
  handleExportPdf: () => Promise<void>;
  handleExportXlsx: () => Promise<void>;
  selectedTeacher: TeacherProfile;
  selectedTeacherId: string;
  setSelectedTeacherId: (id: string) => void;
  teachers: TeacherProfile[];
  validation: Validation;
}) {
  return (
    <section className="grid gap-4 p-4 md:p-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader className="border-b">
          <CardTitle>Lista de docentes</CardTitle>
          <CardDescription>
            Selecciona un docente para revisar su disponibilidad.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 p-3">
          {teachers.map((teacher, index) => (
            <button
              className={cn(
                "flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors",
                selectedTeacherId === teacher.id
                  ? "border-primary bg-accent"
                  : "border-border bg-card hover:bg-accent",
              )}
              key={teacher.id}
              onClick={() => setSelectedTeacherId(teacher.id)}
              type="button"
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="text-muted-foreground tabular-nums">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {teacher.name}
                  </span>
                  <span className="block truncate text-muted-foreground text-xs">
                    {teacher.email}
                  </span>
                </span>
              </span>
              <Badge
                variant={teacher.status === "enviado" ? "default" : "secondary"}
              >
                {contractRules[teacher.contract].short}
              </Badge>
            </button>
          ))}
        </CardContent>
      </Card>
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader className="flex flex-col gap-3 border-b md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="font-serif text-2xl">
                {selectedTeacher.name}
              </CardTitle>
              <CardDescription>
                {contractRules[selectedTeacher.contract].label} -{" "}
                {statusLabel(selectedTeacher.status)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handleExportPdf}>
                <ArrowDownToLine data-icon="inline-start" />
                Exportar PDF
              </Button>
              <Button onClick={handleExportXlsx}>
                <FileSpreadsheet data-icon="inline-start" />
                Exportar Excel
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScheduleGrid availability={selectedTeacher.availability} />
          </CardContent>
        </Card>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Card>
            <CardHeader className="border-b">
              <CardTitle>Cursos seleccionados</CardTitle>
              <CardDescription>
                Vista administrativa para validación y exportación.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              <CoursesTable courses={selectedTeacher.courses} />
            </CardContent>
          </Card>
          <RulePanel profile={selectedTeacher} validation={validation} />
        </div>
      </div>
    </section>
  );
}

function ScheduleGrid({
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
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        <div className="grid grid-cols-[110px_repeat(6,minmax(110px,1fr))] border-b bg-primary text-primary-foreground text-sm">
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
            className="grid grid-cols-[110px_repeat(6,minmax(110px,1fr))] border-b last:border-b-0"
            key={hour}
          >
            <div className="border-r bg-muted/60 p-2 text-center font-medium text-xs tabular-nums">
              {formatHour(hour)}
            </div>
            {days.map((day) => {
              const key = slotKey(day.key, hour);
              const isSelected = selected.has(key);
              const Cell = interactive ? "button" : "div";
              return (
                <Cell
                  className={cn(
                    "min-h-12 border-r p-1 text-xs transition-colors last:border-r-0",
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
                  <span className="flex h-full items-center justify-center">
                    {isSelected ? <Check className="size-4" /> : ""}
                  </span>
                </Cell>
              );
            })}
          </div>
        ))}
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4 text-gold" />
          Reglas activas
        </CardTitle>
        <CardDescription>{rule.text}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-3 text-sm"
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
  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">N°</TableHead>
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
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onRemoveCourse(course.id)}
                      >
                        <Trash2 data-icon="inline-start" />
                        <span className="sr-only">Quitar curso</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Quitar curso</TooltipContent>
                  </Tooltip>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
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
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <section className="grid w-full max-w-5xl gap-6 md:grid-cols-[1fr_420px]">
        <div className="flex flex-col justify-between rounded-lg border bg-card p-6 shadow-sm">
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
          <div className="mt-16 flex flex-col gap-4">
            <p className="max-w-xl text-muted-foreground">
              Plataforma para que docentes registren disponibilidad, cursos y
              envíen su horario 2026.2 a dirección académica.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                "Correo institucional",
                "Reglas por contrato",
                "Export PDF/XLSX",
              ].map((item) => (
                <div
                  className="rounded-md border bg-background p-3 text-sm"
                  key={item}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
        <Card>
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
              <Button asChild variant="outline" className="w-full">
                <a href="/demo">Probar demo</a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
