/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ide: {
          bg: '#0f1117', // Very dark blue/gray
          panel: '#181b21', // Slightly lighter panel
          sidebar: '#1f242c', // Sidebar color
          border: '#2b323b', // Border color
          accent: '#3b82f6', // Blue accent
          text: '#d1d5db', // Gray-300
          textLight: '#f3f4f6', // Gray-100
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', "Liberation Mono", "Courier New", 'monospace'],
      }
    }
  },
  plugins: [],
}

