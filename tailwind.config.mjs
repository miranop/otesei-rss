/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      colors: {
        surface: {
          0: '#0f1117',
          1: '#161b22',
          2: '#1e2430',
          3: '#252d3a',
        },
        accent: {
          DEFAULT: '#58a6ff',
          dim: '#1f4068',
        },
        muted: '#8b949e',
        border: '#30363d',
      },
    },
  },
  plugins: [],
};