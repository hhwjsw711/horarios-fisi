"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import type React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function AppProviders({
  children,
  clerkProxyUrl,
}: {
  children: React.ReactNode;
  clerkProxyUrl?: string;
}) {
  const pathname = usePathname();
  const content = (
    <TooltipProvider>
      {children}
      <Toaster richColors position="top-right" />
    </TooltipProvider>
  );

  if (pathname?.startsWith("/demo")) {
    return content;
  }

  return <ClerkProvider proxyUrl={clerkProxyUrl}>{content}</ClerkProvider>;
}
