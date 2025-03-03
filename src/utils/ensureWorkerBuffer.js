// This script ensures Buffer is available in worker contexts
// It's meant to be imported by the main application

// Create a simple worker to test if Buffer is available
export function testWorkerBuffer() {
  // Only run in browser environment
  if (typeof window === 'undefined') return;
  
  try {
    // Create a simple worker that checks for Buffer
    const workerCode = `
      self.onmessage = function() {
        const hasBuffer = typeof self.Buffer !== 'undefined';
        self.postMessage({
          hasBuffer,
          bufferDetails: hasBuffer ? {
            hasFrom: typeof self.Buffer.from === 'function',
            hasIsBuffer: typeof self.Buffer.isBuffer === 'function',
            hasAlloc: typeof self.Buffer.alloc === 'function'
          } : null
        });
      };
    `;
    
    // Create a blob URL for the worker
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    
    // Create and start the worker
    const worker = new Worker(workerUrl);
    
    worker.onmessage = function(e) {
      console.log('[Worker Buffer Test]', e.data);
      if (!e.data.hasBuffer) {
        console.error('[Worker Buffer Test] Buffer is not available in worker context!');
      } else {
        console.log('[Worker Buffer Test] Buffer is available in worker context');
      }
      
      // Clean up
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    };
    
    // Start the test
    worker.postMessage('test');
  } catch (err) {
    console.error('[Worker Buffer Test] Error testing worker Buffer:', err);
  }
}

// Run the test automatically
if (typeof window !== 'undefined') {
  // Wait for the page to load
  window.addEventListener('load', () => {
    // Wait a bit to ensure everything is loaded
    setTimeout(testWorkerBuffer, 1000);
  });
} 