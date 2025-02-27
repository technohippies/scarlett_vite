import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'protobufjs/minimal.js': 'protobufjs/minimal',
      'buffer': 'buffer',
    },
    mainFields: ['browser', 'module', 'main'],
  },
  define: {
    // Polyfill for process.env
    'process.env': {},
    'global': 'globalThis',
  },
  optimizeDeps: {
    exclude: [
      '@xmtp/wasm-bindings',
      '@xmtp/browser-sdk'
    ],
    include: [
      'protobufjs/minimal',
      'buffer',
    ],
    esbuildOptions: {
      target: 'es2020',
      supported: { 
        bigint: true 
      },
    },
  },
  build: {
    target: 'es2020',
    commonjsOptions: {
      transformMixedEsModules: true,
      include: [/protobufjs/, /node_modules/],
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'credentialless',
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
    fs: {
      // Allow serving files from node_modules
      allow: ['..']
    },
    proxy: {
      '/ipfs': {
        target: 'https://premium.aiozpin.network',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path
      }
    }
  },
  worker: {
    format: 'es',
    plugins: () => [
      {
        name: 'worker-globals',
        resolveId(id) {
          if (id === 'virtual:worker-globals') {
            return id;
          }
          return null;
        },
        load(id) {
          if (id === 'virtual:worker-globals') {
            return `
              if (typeof window === 'undefined') {
                globalThis.window = globalThis;
              }
              if (typeof global === 'undefined') {
                globalThis.global = globalThis;
              }
              if (typeof process === 'undefined') {
                globalThis.process = { env: {} };
              }
            `;
          }
          return null;
        }
      }
    ]
  }
})
