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
      // Required for SharedArrayBuffer and Atomics used by XMTP WASM
      'Cross-Origin-Embedder-Policy': 'require-corp',
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
        rewrite: (path) => path,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('Sending Request:', req.method, req.url);
            // Add CORS headers to the proxy request
            proxyReq.setHeader('Access-Control-Allow-Origin', '*');
            proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            proxyReq.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            console.log('Received Response:', proxyRes.statusCode, req.url);
            // Add CORS headers to the proxy response
            proxyRes.headers['Access-Control-Allow-Origin'] = '*';
            proxyRes.headers['Cross-Origin-Resource-Policy'] = 'cross-origin';
          });
        }
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
