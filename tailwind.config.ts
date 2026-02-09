import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        crystal: {
          base: '#0a0a0f',
          surface: '#0d1117',
          elevated: '#161b22',
          border: 'rgba(255,255,255,0.08)',
          'border-hover': 'rgba(255,255,255,0.12)',
          muted: '#475569',
        },
        status: {
          queued: '#3b82f6',
          processing: '#f59e0b',
          parsed: '#06b6d4',
          imported: '#10b981',
          failed: '#ef4444',
          uploading: '#8b5cf6',
        },
        verification: {
          unreviewed: '#a855f7',
          'in-review': '#eab308',
          verified: '#22c55e',
          disputed: '#ef4444',
        },
        text: {
          primary: '#f1f5f9',
          secondary: '#94a3b8',
          muted: '#475569',
          'ai-guess': '#67e8f9',
        },
      },
      fontFamily: {
        sans: ['Satoshi', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        'glass-1': '8px',
        'glass-2': '16px',
        'glass-3': '24px',
      },
      keyframes: {
        'pulse-glow-amber': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(245, 158, 11, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(245, 158, 11, 0.6)' },
        },
        'pulse-glow-violet': {
          '0%, 100%': { boxShadow: '0 0 8px rgba(139, 92, 246, 0.3)' },
          '50%': { boxShadow: '0 0 20px rgba(139, 92, 246, 0.6)' },
        },
        'border-pulse': {
          '0%, 100%': { borderColor: 'rgba(59, 130, 246, 0.3)' },
          '50%': { borderColor: 'rgba(59, 130, 246, 0.7)' },
        },
      },
      animation: {
        'pulse-glow-amber': 'pulse-glow-amber 1.5s ease-in-out infinite',
        'pulse-glow-violet': 'pulse-glow-violet 1.5s ease-in-out infinite',
        'border-pulse': 'border-pulse 1.5s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
