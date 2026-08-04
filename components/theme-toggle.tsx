'use client';

import { useTheme } from '@/providers/ThemeProvider';
import { IconMoon, IconSun } from '@tabler/icons-react';

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg transition-colors hover:bg-theme-hover focus:outline-none focus:ring-2 focus:ring-[color:var(--accent-1)]"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? (
        <IconSun size={20} className="text-[color:var(--accent-1)]" />
      ) : (
        <IconMoon size={20} className="text-[color:var(--muted)]" />
      )}
    </button>
  );
}
