import { redirect } from "next/navigation";
import { isLocale, localePath } from "@/i18n/routing";

export default async function SignUpPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  redirect(isLocale(lang) ? localePath(lang, "/sign-in") : "/es/sign-in");
}
