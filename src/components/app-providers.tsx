"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { ThemeProvider } from "next-themes";
import type React from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { stripLocale } from "@/i18n/routing";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const appPathname = stripLocale(pathname || "/");
  const content = (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
    >
      <TooltipProvider>
        {children}
        <Toaster richColors position="top-right" />
      </TooltipProvider>
    </ThemeProvider>
  );

  if (
    appPathname.startsWith("/demo") ||
    (process.env.NODE_ENV !== "production" &&
      (appPathname.startsWith("/teacher") ||
        appPathname.startsWith("/direction") ||
        appPathname.startsWith("/onboarding")))
  ) {
    return content;
  }

  return <ClerkProvider>{content}</ClerkProvider>;
}
