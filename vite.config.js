import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import tsconfigPaths from 'vite-tsconfig-paths';
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
                rewrite: function (path) { return path; }
            }
        }
    },
    worker: {
        format: 'es',
        plugins: function () { return [
            {
                name: 'worker-globals',
                resolveId: function (id) {
                    if (id === 'virtual:worker-globals') {
                        return id;
                    }
                    return null;
                },
                load: function (id) {
                    if (id === 'virtual:worker-globals') {
                        return "\n              if (typeof window === 'undefined') {\n                globalThis.window = globalThis;\n              }\n              if (typeof global === 'undefined') {\n                globalThis.global = globalThis;\n              }\n              if (typeof process === 'undefined') {\n                globalThis.process = { env: {} };\n              }\n            ";
                    }
                    return null;
                }
            }
        ]; }
    }
});
