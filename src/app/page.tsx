import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignedOutShell } from "@/components/schedule-app";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    const user = await currentUser();
    redirect(
      user?.publicMetadata?.role === "admin" ||
        user?.publicMetadata?.role === "direccion"
        ? "/direction"
        : "/teacher",
    );
  }
  return <SignedOutShell />;
}
