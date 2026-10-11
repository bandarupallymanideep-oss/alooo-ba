import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export const ThemeToggle: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={toggleTheme}
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      className={`relative inline-flex items-center h-8 w-[60px] rounded-full border border-slate-700 bg-slate-900 p-1 cursor-pointer transition-colors ${className}`}
    >
      <span
        className={`absolute top-1 h-6 w-6 rounded-full shadow-md flex items-center justify-center transition-transform duration-300 ${
          isDark ? 'translate-x-0 bg-slate-700 text-amber-300' : 'translate-x-[26px] bg-amber-500 text-white on-accent'
        }`}
      >
        {isDark ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
      </span>
    </button>
  );
};
