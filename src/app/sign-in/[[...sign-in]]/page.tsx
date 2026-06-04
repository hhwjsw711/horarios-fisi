import { SignIn } from "@clerk/nextjs";
import Image from "next/image";

export default function SignInPage() {
  return (
    <main className="grid min-h-screen bg-background p-6 text-foreground md:grid-cols-[minmax(0,1fr)_460px]">
      <section className="hidden flex-col justify-between rounded-lg border bg-card p-8 shadow-sm md:flex">
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
        <p className="max-w-lg text-muted-foreground">
          Registro de disponibilidad docente y revisión académica para el
          semestre 2026.2.
        </p>
      </section>
      <section className="flex items-center justify-center">
        <SignIn
          appearance={{
            elements: {
              rootBox: "w-full max-w-md",
              cardBox: "w-full shadow-sm",
            },
          }}
        />
      </section>
    </main>
  );
}
