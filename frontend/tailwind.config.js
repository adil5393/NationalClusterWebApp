/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        heading: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        score: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        obsidian: {
          DEFAULT: '#080B10',
          950: '#080B10',
          900: '#0E131B',
          800: '#141B26',
          700: '#1D2636',
          600: '#2C394F',
          500: '#475569',
        },
        gold: {
          DEFAULT: '#F59E0B',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
        },
        saffron: {
          DEFAULT: '#FF7700',
          300: '#FFB266',
          400: '#FFA040',
          500: '#FF7700',
          600: '#E05E00',
          700: '#B84600',
        },
        coral: {
          DEFAULT: '#FF4500',
          500: '#FF4500',
          600: '#EA3C00',
        },
        live: {
          DEFAULT: '#10B981',
          500: '#10B981',
          glow: 'rgba(16, 185, 129, 0.35)',
          cyan: '#06B6D4',
        },
      },
      borderRadius: {
        xl: '12px',
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
      boxShadow: {
        'gold-glow': '0 0 20px -3px rgba(245, 158, 11, 0.3)',
        'live-glow': '0 0 20px -3px rgba(16, 185, 129, 0.4)',
        'court-glow': '0 0 35px -5px rgba(245, 158, 11, 0.15)',
        'card-subtle': '0 4px 20px -2px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'arena-spotlight': 'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(245, 158, 11, 0.12), transparent 70%)',
      },
    },
  },
  plugins: [],
};
