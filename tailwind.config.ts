import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#EE6A3F', 50: '#FDF1EC', 100: '#FBE0D5', 600: '#D9572D', 700: '#B4441F' },
        ink: { DEFAULT: '#211B17', 600: '#4A433E', 500: '#6B645F', 400: '#9A938E' },
        canvas: '#FAF9F7',
        line: '#ECE9E5',
      },
      fontFamily: { sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
      boxShadow: { soft: '0 1px 2px rgba(33,27,23,0.04), 0 1px 3px rgba(33,27,23,0.06)' },
    },
  },
  plugins: [],
} satisfies Config;
