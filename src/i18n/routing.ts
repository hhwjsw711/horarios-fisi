import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es", "zh-CN", "zh-TW"],
  defaultLocale: "es",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];

export const defaultLocale: Locale = routing.defaultLocale;

export const localeLabels: Record<Locale, string> = {
  en: "English",
  es: "Español",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export function isLocale(value: string): value is Locale {
  return routing.locales.includes(value as Locale);
}

export function stripLocale(pathname: string) {
  const locale = routing.locales.find(
    (item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`),
  );
  if (!locale) {
    return pathname;
  }
  const stripped = pathname.slice(locale.length + 1);
  if (!stripped || stripped === "/") {
    return "/";
  }
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

export function localePath(locale: string, pathname = "/") {
  const cleanPathname = stripLocale(pathname);
  return cleanPathname === "/" ? `/${locale}` : `/${locale}${cleanPathname}`;
}
