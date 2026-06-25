/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f5ff',
          100: '#e1ebff',
          200: '#c2d7ff',
          300: '#93b9ff',
          400: '#5c90ff',
          500: '#0052cc', // EduEvents primary blue
          600: '#0043ab',
          700: '#00358a',
          800: '#00286b',
          900: '#001a4d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
