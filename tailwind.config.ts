import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /** Quiet Operator — Site Command global theme */
        qo: {
          canvas: '#EAE7E0',
          card: '#FFFFFF',
          nested: '#FCFBF9',
          sidebar: '#1C1A17',
          'sidebar-text': '#F2EEE6',
          'sidebar-muted': '#7C766C',
          'sidebar-border': 'rgba(231, 227, 219, 0.09)',
          ink: '#211F1C',
          secondary: '#6F6A62',
          muted: '#9A948B',
          faint: '#8A8378',
          accent: '#B5543B',
          'accent-hover': '#9E4631',
          'accent-soft': '#C9A08F',
          sage: '#5F7A50',
          'sage-text': '#576F49',
          ochre: '#B07A2E',
          'ochre-text': '#8A5F24',
          risk: '#A33A2A',
        },
        /** Back-compat aliases — map old Living Crystal tokens to Quiet Operator */
        crystal: {
          base: '#EAE7E0',
          surface: '#FFFFFF',
          elevated: '#FCFBF9',
          border: 'rgba(0, 0, 0, 0.08)',
          'border-hover': 'rgba(0, 0, 0, 0.12)',
          muted: '#9A948B',
        },
        background: '#EAE7E0',
        status: {
          queued: '#B07A2E',
          processing: '#B07A2E',
          parsed: '#5F7A50',
          imported: '#576F49',
          failed: '#A33A2A',
          uploading: '#B5543B',
        },
        verification: {
          unreviewed: '#8A5F24',
          'in-review': '#B07A2E',
          verified: '#576F49',
          disputed: '#A33A2A',
        },
        text: {
          primary: '#211F1C',
          secondary: '#6F6A62',
          muted: '#9A948B',
          'ai-guess': '#5F7A50',
        },
      },
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        qo: '16px',
        'qo-sm': '9px',
      },
      boxShadow: {
        qo: 'none',
        'qo-card': '0 0 0 1px rgba(0, 0, 0, 0.08)',
      },
      keyframes: {
        'qo-pulse': {
          '0%': { boxShadow: '0 0 0 0 rgba(95, 122, 80, 0.5)' },
          '70%': { boxShadow: '0 0 0 5px rgba(95, 122, 80, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(95, 122, 80, 0)' },
        },
      },
      animation: {
        'qo-pulse': 'qo-pulse 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
