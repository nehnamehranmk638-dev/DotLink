import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/auth': 'http://127.0.0.1:8000',
      '/children': 'http://127.0.0.1:8000',
      '/textbooks': 'http://127.0.0.1:8000',
      '/topics': 'http://127.0.0.1:8000',
      '/sessions': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
      '/health': 'http://127.0.0.1:8000'
    }
  }
})
