import { SignIn } from "@clerk/nextjs";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LanguageSwitcher } from "@/components/language-switcher";
import { isLocale, localePath } from "@/i18n/routing";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    redirect("/es/sign-in");
  }
  const t = await getTranslations({ locale: lang });
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
              {t("auth.heroTitle")}
            </p>
            <p className="text-sidebar-foreground/75 text-sm leading-6">
              {t("auth.heroDescription")}
            </p>
          </div>
          <div className="space-y-3 border-sidebar-border border-t pt-3">
            <p className="text-sidebar-foreground/70 text-sm">
              {t("auth.faculty")}
            </p>
            <LanguageSwitcher />
          </div>
        </div>
        <section className="flex min-h-0 flex-col items-center justify-center gap-4 p-4 md:p-6">
          <div className="flex w-full max-w-md justify-end md:hidden">
            <LanguageSwitcher />
          </div>
          <SignIn
            routing="path"
            path={localePath(lang, "/sign-in")}
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
