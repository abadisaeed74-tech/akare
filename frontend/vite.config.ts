import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // يسمح بالوصول من خارج الجهاز (مثل Cloudflare Tunnel)
    host: true,
    // يسمح لكل الدومينات (بما فيها روابط trycloudflare.com المتغيّرة)
    allowedHosts: true,
  },
})
