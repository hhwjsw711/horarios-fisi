import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AppProviders } from "@/components/app-providers";
import { isLocale, routing } from "@/i18n/routing";
import "../globals.css";

type LocaleLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export function generateStaticParams() {
  return routing.locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: Pick<LocaleLayoutProps, "params">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const messages = await getMessages({ locale: lang });
  const meta = messages.meta as {
    description: string;
    ogDescription: string;
    twitterDescription: string;
  };
  const ogImageUrl = `/${lang}/opengraph-image`;
  return {
    metadataBase: new URL("https://horarios-unmsm.vercel.app"),
    applicationName: "Horarios FISI",
    title: {
      default: "Horarios FISI | UNMSM",
      template: "%s | Horarios FISI",
    },
    description: meta.description,
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(
        routing.locales.map((locale) => [locale, `/${locale}`]),
      ),
    },
    openGraph: {
      title: "Horarios FISI | UNMSM",
      description: meta.ogDescription,
      url: `/${lang}`,
      siteName: "Horarios FISI",
      locale: metadataLocale(lang),
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: "Horarios FISI UNMSM",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Horarios FISI | UNMSM",
      description: meta.twitterDescription,
      images: [ogImageUrl],
    },
    icons: {
      icon: "/icon.png",
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { lang } = await params;
  if (!isLocale(lang)) {
    notFound();
  }
  const messages = await getMessages({ locale: lang });

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider locale={lang} messages={messages}>
          <AppProviders>{children}</AppProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

function metadataLocale(locale: string) {
  const localesByAppLocale: Record<string, string> = {
    en: "en_US",
    es: "es_PE",
    "zh-CN": "zh_CN",
    "zh-TW": "zh_TW",
  };
  return localesByAppLocale[locale] ?? "es_PE";
}
