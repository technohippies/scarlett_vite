import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    tsconfigPaths(),
    // Polyfills configuration for both XMTP and Irys
    nodePolyfills({
      // Include necessary polyfills
      include: [
        'buffer',
        'process',
        'crypto', // Add crypto for Irys
        'stream', // Needed for crypto operations
        'events',  // Needed for crypto operations
        'util'     // Needed for crypto operations
      ],
      globals: {
        Buffer: true,
        process: true,
      },
      protocolImports: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'protobufjs/minimal.js': 'protobufjs/minimal',
      // Add explicit alias for crypto
      'crypto': 'crypto-browserify',
    },
    mainFields: ['browser', 'module', 'main'],
  },
  define: {
    // Fix for browserify-sign
    'process.browser': true,
    'process.env': '{}',
  },
  optimizeDeps: {
    exclude: [
      '@xmtp/wasm-bindings',
      '@xmtp/browser-sdk'
    ],
    include: [
      'protobufjs/minimal',
      '@irys/web-upload',
      '@irys/web-upload-ethereum',
      '@irys/web-upload-ethereum-ethers-v6',
      'crypto-browserify', // Include crypto-browserify
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
    // Improve chunk handling for dynamic imports
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'xmtp': ['@xmtp/browser-sdk'],
          'irys': ['@irys/web-upload', '@irys/web-upload-ethereum', '@irys/web-upload-ethereum-ethers-v6'],
        }
      }
    }
  },
  // Improve handling of dynamic imports in development
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
})
