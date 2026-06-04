import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { SignedOutShell } from "@/components/schedule-app";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/docente");
  }
  return <SignedOutShell />;
}
