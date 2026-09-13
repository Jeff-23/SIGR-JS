/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        screen: '#c5c1c0', steel: 'rgb(var(--sigr-steel) / <alpha-value>)', denim: 'rgb(var(--sigr-denim) / <alpha-value>)', marigold: 'rgb(var(--sigr-marigold) / <alpha-value>)',
      },
      boxShadow: { card: '0 24px 60px rgba(26, 41, 48, .10)', glow: '0 14px 34px rgba(247, 206, 62, .16)' },
    },
  },
  plugins: [],
}
