"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { type Locale, localeLabels, stripLocale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const supportedLocales: Locale[] = ["en", "es", "zh-CN", "zh-TW"];

export function LanguageSwitcher({ className }: { className?: string }) {
  const pathname = usePathname();
  const t = useTranslations("common");
  const locale = useLocale();
  const cleanPathname = stripLocale(pathname || "/");

  return (
    <nav
      aria-label={t("language")}
      className={cn("flex flex-wrap items-center gap-1", className)}
    >
      {supportedLocales.map((item) => (
        <Link
          aria-current={item === locale ? "page" : undefined}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            item === locale
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          key={item}
          href={cleanPathname}
          locale={item}
        >
          {localeLabels[item]}
        </Link>
      ))}
    </nav>
  );
}
