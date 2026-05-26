import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    // За nginx на pallink.fun — иначе Vite отвечает 403
    allowedHosts: ['pallink.fun', 'www.pallink.fun', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': 'http://backend:8000',
    },
  },
})
