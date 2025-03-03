// Custom Vite plugin to inject Buffer polyfill into worker scripts
import fs from 'fs';
import path from 'path';

export default function workerPolyfillPlugin() {
  const polyfillCode = fs.readFileSync(
    path.resolve(__dirname, 'public/buffer-polyfill.js'),
    'utf-8'
  );
  
  return {
    name: 'vite-plugin-worker-buffer-polyfill',
    
    // Transform worker scripts to include our polyfill
    transform(code, id) {
      // Only transform worker scripts
      if (id.includes('node_modules/vite/dist/client') || id.endsWith('.worker.js')) {
        console.log(`[Worker Polyfill Plugin] Injecting Buffer polyfill into worker: ${id}`);
        // Prepend our polyfill code to the worker script
        return {
          code: `${polyfillCode}\n${code}`,
          map: null
        };
      }
      return null;
    }
  };
} 