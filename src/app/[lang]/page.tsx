import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LocalizedSignedOutShell } from "@/components/schedule-app";
import { isLocale, localePath } from "@/i18n/routing";

export default async function Home({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    redirect("/es");
  }
  const { userId } = await auth();
  if (userId) {
    const user = await currentUser();
    redirect(
      user?.publicMetadata?.role === "admin" ||
        user?.publicMetadata?.role === "direccion"
        ? localePath(lang, "/direction")
        : localePath(lang, "/teacher"),
    );
  }
  return <LocalizedSignedOutShell />;
}
