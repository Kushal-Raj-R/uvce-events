import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Disable hot module client reloads during aggressive mobile environment testing
    hmr: false, 
    watch: {
      usePolling: false
    }
  }
})
