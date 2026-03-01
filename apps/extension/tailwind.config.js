/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        trench: {
          bg: '#0f1117',
          surface: '#1a1d26',
          border: '#2a2d38',
          accent: '#6366f1',
          'accent-hover': '#818cf8',
          text: '#e2e8f0',
          'text-muted': '#94a3b8',
          danger: '#ef4444',
          success: '#22c55e',
          warning: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
};
