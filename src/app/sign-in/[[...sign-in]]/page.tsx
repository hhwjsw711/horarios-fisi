import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-background p-3 text-foreground md:p-6">
      <section className="grid h-full max-h-[620px] w-full max-w-5xl overflow-hidden rounded-lg border bg-card shadow-sm md:grid-cols-[minmax(0,1fr)_420px]">
        <div className="hidden min-h-0 flex-col justify-between bg-sidebar p-8 text-sidebar-foreground md:flex">
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
            <p className="font-serif text-4xl leading-tight">
              Ingreso para docentes y Dirección Académica.
            </p>
            <p className="text-sidebar-foreground/75 text-sm leading-6">
              Sistema de registro y revisión de disponibilidad docente del
              semestre vigente.
            </p>
          </div>
          <p className="border-sidebar-border border-t pt-3 text-sidebar-foreground/70 text-sm">
            Facultad de Ingeniería de Sistemas e Informática
          </p>
        </div>
        <section className="flex min-h-0 items-center justify-center p-4 md:p-6">
          <SignIn
            routing="path"
            path="/sign-in"
            appearance={{
              elements: {
                rootBox: "w-full max-w-md",
                cardBox: "w-full border shadow-sm",
                footerAction: "hidden",
                headerTitle: "font-serif",
              },
            }}
          />
        </section>
      </section>
    </main>
  );
}
