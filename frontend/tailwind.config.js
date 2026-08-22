/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        coral: {
          DEFAULT: '#FF4500',
          600: '#EA3C00',
        },
        obsidian: '#0A0A0A',
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      keyframes: {
        'room-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,69,0,0.45)', transform: 'scale(1)' },
          '50%': { boxShadow: '0 0 22px 8px rgba(255,69,0,0.28)', transform: 'scale(1.035)' },
        },
      },
      animation: {
        'room-pulse': 'room-pulse 1.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
