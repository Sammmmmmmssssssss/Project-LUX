/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['Space Mono', 'monospace'],
        serif: ['Cormorant Garamond', 'serif'],
      },
      colors: {
        bg: 'var(--bg)',
        ink: 'var(--ink)',
        accent: 'var(--accent)',
        muted: 'var(--muted)',
      }
    },
  },
  plugins: [],
}
