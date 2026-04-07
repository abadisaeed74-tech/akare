import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // يسمح بالوصول من خارج الجهاز (مثل Cloudflare Tunnel)
    host: true,
    // يسمح لكل الدومينات (بما فيها روابط trycloudflare.com المتغيّرة)
    allowedHosts: true,
  },
})
