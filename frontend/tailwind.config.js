/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        screen: '#c5c1c0', steel: '#0a1612', denim: '#1a2930', marigold: '#f7ce3e',
      },
      boxShadow: { card: '0 24px 60px rgba(26, 41, 48, .10)', glow: '0 14px 34px rgba(247, 206, 62, .16)' },
    },
  },
  plugins: [],
}
