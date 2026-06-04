export type DayKey =
  | "lunes"
  | "martes"
  | "miercoles"
  | "jueves"
  | "viernes"
  | "sabado";

export type ContractKey = "full" | "partial20" | "partial10";

export type Course = {
  id: string;
  code?: string;
  name: string;
  school: string;
  active?: boolean;
  cycle?: number | null;
  credits?: number | null;
  courseType?: string | null;
  curriculum?: string | null;
  isThesis?: boolean;
};

export type TeacherProfile = {
  id: string;
  teacherCode?: string;
  name: string;
  email: string;
  category?: string;
  academicDegree?: string;
  contract: ContractKey;
  status: "enviado" | "borrador" | "observado" | "aprobado";
  courses: Course[];
  availability: string[];
  reviewNote?: string;
  submittedAt?: string;
  approvedAt?: string;
  updatedAt?: string;
};

export const days: { key: DayKey; label: string }[] = [
  { key: "lunes", label: "Lunes" },
  { key: "martes", label: "Martes" },
  { key: "miercoles", label: "Miércoles" },
  { key: "jueves", label: "Jueves" },
  { key: "viernes", label: "Viernes" },
  { key: "sabado", label: "Sábado" },
];

export const hours = Array.from({ length: 14 }, (_, index) => index + 8);

export const contractRules: Record<
  ContractKey,
  {
    label: string;
    short: string;
    requiredHours: number;
    requiredDailyHours: number;
    requiredDailyBlockCount: number;
    requiredBlockDays: number;
    maxCourses: number;
    text: string;
  }
> = {
  full: {
    label: "Tiempo completo",
    short: "TC",
    requiredHours: 40,
    requiredDailyHours: 8,
    requiredDailyBlockCount: 2,
    requiredBlockDays: 5,
    maxCourses: 3,
    text: "8 horas diarias en bloques de 4 horas y hasta 3 cursos aparte de Tesis.",
  },
  partial20: {
    label: "Tiempo parcial 20 h",
    short: "TP 20",
    requiredHours: 20,
    requiredDailyHours: 4,
    requiredDailyBlockCount: 1,
    requiredBlockDays: 5,
    maxCourses: 2,
    text: "4 horas diarias en bloques de 4 horas y hasta 2 cursos aparte de Tesis.",
  },
  partial10: {
    label: "Tiempo parcial 10 h",
    short: "TP 10",
    requiredHours: 12,
    requiredDailyHours: 4,
    requiredDailyBlockCount: 1,
    requiredBlockDays: 3,
    maxCourses: 1,
    text: "4 horas en 3 días de la semana y 1 curso aparte de Tesis.",
  },
};

export const schools = [
  "Ing. de Sistemas",
  "Contabilidad",
  "Medicina Humana",
  "Administración",
  "Educación",
];

export const courseCatalog: Course[] = [
  { id: "algoritmos", name: "Algoritmos", school: "Ing. de Sistemas" },
  { id: "base-datos", name: "Base de Datos", school: "Ing. de Sistemas" },
  {
    id: "arquitectura-software",
    name: "Arquitectura de Software",
    school: "Ing. de Sistemas",
  },
  {
    id: "contabilidad-general",
    name: "Contabilidad General",
    school: "Contabilidad",
  },
  { id: "costos", name: "Costos y Presupuestos", school: "Contabilidad" },
  {
    id: "anatomia",
    name: "Anatomía Humana",
    school: "Medicina Humana",
  },
  {
    id: "fisiologia",
    name: "Fisiología",
    school: "Medicina Humana",
  },
  {
    id: "gestion-publica",
    name: "Gestión Pública",
    school: "Administración",
  },
  {
    id: "didactica",
    name: "Didáctica Universitaria",
    school: "Educación",
  },
  {
    id: "tesis",
    name: "Tesis",
    school: "Transversal",
    isThesis: true,
  },
];

export function slotKey(day: DayKey, hour: number) {
  return `${day}-${hour}`;
}

export function formatHour(hour: number) {
  return `${hour.toString().padStart(2, "0")}:00 - ${(hour + 1)
    .toString()
    .padStart(2, "0")}:00`;
}

export function seedSlots(entries: Partial<Record<DayKey, number[]>>) {
  return Object.entries(entries).flatMap(([day, dayHours]) =>
    (dayHours ?? []).map((hour) => slotKey(day as DayKey, hour)),
  );
}

export const seedTeachers: TeacherProfile[] = [
  {
    id: "me",
    name: "Railly Hugo",
    email: "railly@unmsm.edu.pe",
    contract: "full",
    status: "borrador",
    courses: [courseCatalog[0], courseCatalog[1], courseCatalog[2]],
    availability: seedSlots({
      lunes: [8, 9, 10, 11, 14, 15, 16, 17],
      martes: [8, 9, 10, 11, 14, 15, 16, 17],
      miercoles: [8, 9, 10, 11, 18, 19, 20, 21],
      jueves: [8, 9, 10, 11, 18, 19, 20, 21],
      viernes: [14, 15, 16, 17],
    }),
  },
  {
    id: "maria-lopez",
    name: "María López",
    email: "maria.lopez@unmsm.edu.pe",
    contract: "partial20",
    status: "enviado",
    submittedAt: "03 Jun 2026, 18:12",
    courses: [courseCatalog[0], courseCatalog[1]],
    availability: seedSlots({
      lunes: [8, 9, 10, 11],
      martes: [8, 9, 10, 11],
      miercoles: [14, 15, 16, 17],
      jueves: [14, 15, 16, 17],
      viernes: [18, 19, 20, 21],
    }),
  },
  {
    id: "carlos-ramos",
    name: "Carlos Ramos",
    email: "carlos.ramos@unmsm.edu.pe",
    contract: "partial10",
    status: "observado",
    submittedAt: "03 Jun 2026, 16:40",
    courses: [courseCatalog[3]],
    availability: seedSlots({
      lunes: [8, 9, 10, 11],
      miercoles: [8, 9, 10, 11],
      viernes: [14, 15, 16],
    }),
  },
  {
    id: "ana-torres",
    name: "Ana Torres",
    email: "ana.torres@unmsm.edu.pe",
    contract: "full",
    status: "enviado",
    submittedAt: "03 Jun 2026, 19:04",
    courses: [courseCatalog[4], courseCatalog[5], courseCatalog[9]],
    availability: seedSlots({
      lunes: [8, 9, 10, 11, 14, 15, 16, 17],
      martes: [8, 9, 10, 11, 14, 15, 16, 17],
      miercoles: [8, 9, 10, 11, 14, 15, 16, 17],
      jueves: [8, 9, 10, 11, 14, 15, 16, 17],
      viernes: [8, 9, 10, 11, 14, 15, 16, 17],
    }),
  },
];
