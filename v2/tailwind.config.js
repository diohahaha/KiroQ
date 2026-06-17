/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{ts,tsx,html}'],
  theme: {
    extend: {
      colors: {
        // 映射 Shadcn/ui 语义化 token → KiroQ CSS 变量
        background: 'var(--kq-bg-primary)',
        foreground: 'var(--kq-text-primary)',
        primary: {
          DEFAULT: 'var(--kq-accent)',
          foreground: '#ffffff',
        },
        secondary: {
          DEFAULT: 'var(--kq-bg-secondary)',
          foreground: 'var(--kq-text-primary)',
        },
        muted: {
          DEFAULT: 'var(--kq-bg-card)',
          foreground: 'var(--kq-text-muted)',
        },
        accent: {
          DEFAULT: 'var(--kq-accent)',
          foreground: '#ffffff',
        },
        border: 'var(--kq-border)',
        ring: 'var(--kq-accent)',
      },
      borderRadius: {
        lg: '8px',
        md: '6px',
        sm: '4px',
      },
    },
  },
  plugins: [],
}
