import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  optimizeDeps: {
    exclude: ["@xmtp/wasm-bindings", "@xmtp/browser-sdk"],
    include: ["@xmtp/proto"],
  },
  server: {
    watch: {
      usePolling: true,
    },
    host: true, // needed for the DC port mapping to work
    strictPort: false, // Allow fallback to another port if 3002 is in use
    port: 3002,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': process.env
  }
})
