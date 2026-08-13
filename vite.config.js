import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => ({
  base:
    command === 'serve'
      ? '/'
      : mode === 'electron'
        ? './'
        : '/static/',

  plugins: [
    react(),
    tailwindcss(),
  ],
}))