import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppProviders } from "@/components/app-providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const clerkProxyUrl =
  process.env.NODE_ENV === "production" ? "/__clerk" : undefined;

export const metadata: Metadata = {
  metadataBase: new URL("https://horarios-unmsm.vercel.app"),
  applicationName: "Horarios FISI",
  title: {
    default: "Horarios FISI | UNMSM",
    template: "%s | Horarios FISI",
  },
  description:
    "Sistema institucional para registrar y revisar la disponibilidad docente de la Facultad de Ingeniería de Sistemas e Informática de la UNMSM.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Horarios FISI | UNMSM",
    description:
      "Registro y revisión de disponibilidad docente para el semestre académico vigente.",
    url: "/",
    siteName: "Horarios FISI",
    locale: "es_PE",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Horarios FISI UNMSM",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Horarios FISI | UNMSM",
    description:
      "Disponibilidad docente y revisión académica para la FISI UNMSM.",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: "/icon.png",
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <AppProviders clerkProxyUrl={clerkProxyUrl}>{children}</AppProviders>
      </body>
    </html>
  );
}
