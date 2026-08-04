'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { IconMoon, IconSun, IconCheck } from '@tabler/icons-react';
import { useTheme } from '@/providers/ThemeProvider';
import { useEffect, useRef, useState } from 'react';

const locales = ['en', 'it', 'es', 'fr', 'de'];

const FlagIcon = ({ code }: { code: string }) => {
  const flags: Record<string, React.ReactElement> = {
    en: (
      <svg viewBox="0 0 60 30" width="20" height="10">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="white" strokeWidth="6" />
        <path d="M0,0 L60,30 M60,0 L0,30" stroke="#c8102e" strokeWidth="4" clipPath="url(#clip)" />
        <path d="M30,0 V30 M0,15 H60" stroke="white" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#c8102e" strokeWidth="6" />
      </svg>
    ),
    it: (
      <svg viewBox="0 0 60 30" width="20" height="10">
        <rect width="20" height="30" fill="#009246" />
        <rect x="20" width="20" height="30" fill="white" />
        <rect x="40" width="20" height="30" fill="#c8102e" />
      </svg>
    ),
    es: (
      <svg viewBox="0 0 60 30" width="20" height="10">
        <rect width="60" height="30" fill="#c60b1e" />
        <rect y="7.5" width="60" height="15" fill="#ffc400" />
      </svg>
    ),
    fr: (
      <svg viewBox="0 0 60 30" width="20" height="10">
        <rect width="20" height="30" fill="#002395" />
        <rect x="20" width="20" height="30" fill="white" />
        <rect x="40" width="20" height="30" fill="#c8102e" />
      </svg>
    ),
    de: (
      <svg viewBox="0 0 60 30" width="20" height="10">
        <rect width="60" height="10" fill="black" />
        <rect y="10" width="60" height="10" fill="#d00" />
        <rect y="20" width="60" height="10" fill="#ffce00" />
      </svg>
    ),
  };

  return flags[code] || null;
};

export function Navbar() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
      if (themeDropdownRef.current && !themeDropdownRef.current.contains(event.target as Node)) {
        setIsThemeDropdownOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsLanguageDropdownOpen(false);
        setIsThemeDropdownOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const handleLanguageChange = (newLocale: string) => {
    const segments = pathname.split('/').filter(Boolean);
    segments[0] = newLocale;
    router.push('/' + segments.join('/'));
    setIsLanguageDropdownOpen(false);
  };

  const closeAll = () => {
    setIsLanguageDropdownOpen(false);
    setIsThemeDropdownOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      {/* Crystal shell */}
      <div className="crystal-nav">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Brand */}
            <div className="flex items-center gap-3">
              <Link href={`/${locale}`} className="relative select-none text-lg font-semibold tracking-wide">
                <span className="crystal-brand">Theia</span>
                <span className="pointer-events-none absolute -inset-x-6 -top-4 h-10 blur-2xl opacity-60 crystal-brand-glow" />
              </Link>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {/* Language */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isLanguageDropdownOpen}
                  onClick={() => {
                    setIsLanguageDropdownOpen((v) => !v);
                    setIsThemeDropdownOpen(false);
                  }}
                  title={t('common.language')}
                  className="crystal-btn"
                >
                  <span className="inline-flex items-center gap-2">
                    <FlagIcon code={locale} />
                    <span className="text-xs font-semibold uppercase tracking-widest">
                      {locale}
                    </span>
                  </span>
                </button>

                {isLanguageDropdownOpen && (
                  <div className="crystal-popover">
                    {/* backblur + glass base */}
                    <div className="crystal-popover-inner">
                      {locales.map((loc) => {
                        const active = loc === locale;
                        return (
                          <button
                            key={loc}
                            type="button"
                            onClick={() => handleLanguageChange(loc)}
                            onMouseDown={(e) => e.preventDefault()}
                            className={`
                              crystal-item
                              border-0
                              hover:bg-cyan-400/10 dark:hover:bg-cyan-400/10
                              ${active ? 'crystal-item-active' : ''}
                            `}
                          >
                            <span className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2">
                                <FlagIcon code={loc} />
                                <span className="text-sm font-medium">{loc.toUpperCase()}</span>
                              </span>
                              {active && (
                                <span className="opacity-90">
                                  <IconCheck size={16} />
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Theme */}
              <div className="relative" ref={themeDropdownRef}>
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isThemeDropdownOpen}
                  onClick={() => {
                    setIsThemeDropdownOpen((v) => !v);
                    setIsLanguageDropdownOpen(false);
                  }}
                  title={t('common.theme')}
                  className="crystal-btn crystal-btn-iconOnly"
                >
                  <span className="crystal-btn-icon">
                    {theme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
                  </span>
                </button>

                {isThemeDropdownOpen && (
                  <div className="crystal-popover">
                    {/* backblur + glass base */}
                    <div className="crystal-popover-inner">
                      <button
                        type="button"
                        onClick={() => {
                          setTheme('light');
                          closeAll();
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`
                          crystal-item border-0
                          hover:bg-emerald-400/10 dark:hover:bg-emerald-400/10
                          ${theme === 'light' ? 'crystal-item-active' : ''}
                        `}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">Light</span>
                          {theme === 'light' && <IconCheck size={16} />}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setTheme('dark');
                          closeAll();
                        }}
                        onMouseDown={(e) => e.preventDefault()}
                        className={`
                          crystal-item border-0
                          hover:bg-emerald-400/10 dark:hover:bg-emerald-400/10
                          ${theme === 'dark' ? 'crystal-item-active' : ''}
                        `}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-medium">Dark</span>
                          {theme === 'dark' && <IconCheck size={16} />}
                        </span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Optional: tiny divider glow */}
              <div className="hidden sm:block h-6 w-px crystal-divider" />
            </div>
          </div>
        </div>
      </div>

      {/* subtle bottom hairline */}
      <div className="h-px w-full crystal-hairline" />
    </nav>
  );
}
