/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette derived from the Solution Seeking logo + typography.
        brand: {
          // Royal/periwinkle blue — the logo mark & "Solution" wordmark.
          DEFAULT: '#5271FF',
          50: '#EEF1FF',
          100: '#E0E6FF',
          200: '#C6D0FF',
          300: '#A3B2FF',
          400: '#7E90FF',
          500: '#5271FF',
          600: '#3B53F0',
          700: '#2E40CC',
          800: '#2736A3',
          900: '#243480',
        },
        // Bright sky blue — the "SEEKING" impact word.
        sky: {
          DEFAULT: '#3D9BF0',
          400: '#5BA9F2',
          500: '#3D9BF0',
          600: '#2A86DB',
        },
        // Deep navy — headings & high-emphasis text.
        ink: {
          DEFAULT: '#16276B',
          700: '#1E2F7A',
          800: '#16276B',
          900: '#0F1B4D',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Anton', 'Poppins', 'sans-serif'],
      },
      maxWidth: {
        prose: '72ch',
      },
      boxShadow: {
        card: '0 1px 3px rgba(22, 39, 107, 0.08), 0 8px 24px rgba(22, 39, 107, 0.06)',
        'card-hover': '0 2px 6px rgba(22, 39, 107, 0.10), 0 16px 40px rgba(22, 39, 107, 0.12)',
      },
    },
  },
  plugins: [],
};
