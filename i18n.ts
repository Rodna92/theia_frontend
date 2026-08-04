import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale) {
    locale = 'en';
  }

  return {
    locale,
    timeZone: 'UTC',
    messages: (await import(`./locales/${locale}.json`)).default,
  };
});
