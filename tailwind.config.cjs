/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Light theme colors (Claude.ai inspired)
        light: {
          bg: '#ffffff',
          surface: '#f9fafb',
          border: '#e5e7eb',
          text: {
            primary: '#1f2937',
            secondary: '#6b7280',
          },
          accent: '#d97706',
        },
        // Dark theme colors
        dark: {
          bg: '#1a1a1a',
          surface: '#262626',
          border: '#404040',
          text: {
            primary: '#f3f4f6',
            secondary: '#9ca3af',
          },
          accent: '#f59e0b',
        },
      },
    },
  },
  plugins: [],
}
