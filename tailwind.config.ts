import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#EE6A3F', 50: '#FEF4F0', 100: '#FCE3D9', 200: '#F9C6B2', 600: '#DC5729', 700: '#B8451E' },
        ink: { DEFAULT: '#1C1917', 700: '#3A3431', 600: '#57514C', 500: '#78716C', 400: '#A8A29E', 300: '#D6D3D1' },
        canvas: '#F7F6F4',
        line: '#E9E6E2',
        sidebar: '#FBFAF9',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        xs: '0 1px 2px rgba(28,25,23,0.04)',
        soft: '0 1px 2px rgba(28,25,23,0.04), 0 1px 3px rgba(28,25,23,0.05)',
        pop: '0 10px 30px -10px rgba(28,25,23,0.25), 0 2px 6px rgba(28,25,23,0.06)',
      },
      fontSize: { '2xs': ['11px', '16px'] },
    },
  },
  plugins: [],
} satisfies Config;
