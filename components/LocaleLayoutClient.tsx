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
            app-canvas
          "
        >
          <Navbar />
          <main className="pt-16">{children}</main>
        </div>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
