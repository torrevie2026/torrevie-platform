import { dirForLocale, isLocale, type Locale } from "@torrevie/localization";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "ar" }];
}

export default async function LocaleLayout({
  children,
  params
}: Readonly<{
  children: ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  if (!isLocale(locale)) {
    notFound();
  }

  return (
    <div className="localized-root" lang={locale} dir={dirForLocale(locale as Locale)}>
      {children}
    </div>
  );
}
