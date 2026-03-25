/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dsa: {
          bg: '#1a1612',
          'bg-light': '#2a2420',
          'bg-medium': '#352f28',
          'bg-card': '#3a3330',
          gold: '#c9a84c',
          'gold-light': '#e0c76a',
          'gold-dark': '#a88a30',
          parchment: '#e8dcc8',
          'parchment-dark': '#c4b8a4',
          rust: '#8b4513',
          'rust-light': '#a0522d',
          blood: '#8b0000',
          forest: '#2d5a27',
          'forest-light': '#3a7a32',
          mana: '#4a7ab5',
          'mana-light': '#6a9ad5',
          karma: '#9a6ab5',
          'karma-light': '#ba8ad5',
          danger: '#dc2626',
          warning: '#f59e0b',
          success: '#22c55e',
        }
      },
      fontFamily: {
        display: ['Georgia', 'serif'],
        body: ['system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'pulse-red': 'pulse-red 1.5s ease-in-out infinite',
        'glow-gold': 'glow-gold 2s ease-in-out infinite',
        'fade-in': 'fade-in 0.3s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-in-right': 'slide-in-right 0.3s ease-out',
      },
      keyframes: {
        'pulse-red': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(220, 38, 38, 0)' },
        },
        'glow-gold': {
          '0%, 100%': { boxShadow: '0 0 5px rgba(201, 168, 76, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(201, 168, 76, 0.6)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-in-right': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}
