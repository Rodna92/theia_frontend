'use client';

import { NextIntlClientProvider } from 'next-intl';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { Navbar } from './Navbar';

export function LocaleLayoutClient({
  children,
  locale,
  messages,
}: {
  children: React.ReactNode;
  locale: string;
  messages: any;
}) {
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ThemeProvider>
        <div
          className="
            fixed inset-0 min-h-screen min-w-full
            relative isolate overflow-hidden
            bg-slate-50
            bg-[radial-gradient(circle_at_18%_12%,rgba(34,211,238,0.18),transparent_45%),radial-gradient(circle_at_82%_18%,rgba(16,185,129,0.14),transparent_42%),linear-gradient(135deg,#f8fafc,#eef2ff)]
            dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-slate-950
          "
        >
          <Navbar />
          <main className="pt-16">{children}</main>
        </div>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
