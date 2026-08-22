import tailwindcssAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['PingFang SC', 'system-ui', 'sans-serif']
      },
      colors: {
        brand: {
          cyan: '#22D3EE',
          blue: '#3B82F6',
          indigo: '#6366F1'
        }
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'pulse-soft': {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0.55' }
        }
      },
      animation: {
        'fade-in': 'fade-in 0.35s ease-out',
        'pulse-soft': 'pulse-soft 1.4s ease-in-out infinite'
      }
    }
  },
  plugins: [tailwindcssAnimate]
}
