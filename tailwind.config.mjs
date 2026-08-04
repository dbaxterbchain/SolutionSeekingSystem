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
        /*
         * The solution. Gold marks the thing the whole system is for: the third
         * protocol step, the outcome of a tool, the moment something is found.
         * The palette is otherwise all cool blues, so the one warm colour is the
         * one that means "you got there" rather than a decorative accent.
         *
         * Used sparingly on purpose. If gold appears everywhere it stops meaning
         * arrival and becomes another brand colour.
         *
         * SCOPED DELIBERATELY, for two reasons that are easy to forget later:
         *
         * 1. `gold` (500) is 1.58:1 on white and 8.66:1 on ink-800. It is a
         *    DARK-BACKGROUND colour. On light surfaces it is a shape, never
         *    type; 800 and 900 are the steps that pass text on white.
         * 2. Amber already means "warning" in eleven components, and amber-200
         *    is close enough to this that they read as one family. Gold is
         *    never a status colour.
         *
         * `sky` remains the accent (the SEEKING word). This is a supporting
         * colour, not a fourth pillar. Full rules and live ratios on /design.
         */
        gold: {
          DEFAULT: '#F2C879',
          50: '#FDF7ED',
          100: '#FAEED6',
          200: '#F7E0B6',
          300: '#F4D59A',
          400: '#F2CE8A',
          500: '#F2C879',
          600: '#E2AF50',
          // 800 is tuned darker than an even ramp would put it (4.27 -> 4.68 on
          // white) so "800 and darker are safe for text on white" is a clean rule.
          700: '#CE9427',
          800: '#956D23',
          900: '#775922',
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
