import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#E8622F', 50: '#FDF3EE', 100: '#FAE1D5', 200: '#F5C3AB', 600: '#D35422', 700: '#AE4218' },
        ink: { DEFAULT: '#18181B', 700: '#3F3F46', 600: '#52525B', 500: '#71717A', 400: '#A1A1AA', 300: '#D4D4D8' },
        canvas: '#F7F7F8',
        line: '#E4E4E7',
        sidebar: '#FFFFFF',
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 1px rgba(24,24,27,0.04)',
        soft: '0 1px 2px rgba(24,24,27,0.04)',
        pop: '0 16px 40px -12px rgba(24,24,27,0.28), 0 2px 6px rgba(24,24,27,0.06)',
      },
      fontSize: { '2xs': ['11px', '16px'] },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': { from: { opacity: '0', transform: 'translateY(6px) scale(.985)' }, to: { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .15s ease-out', 'pop-in': 'pop-in .18s cubic-bezier(.2,.8,.2,1)' },
    },
  },
  plugins: [],
} satisfies Config;
