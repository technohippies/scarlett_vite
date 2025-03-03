// Worker Buffer Polyfill
// This file provides a Buffer polyfill for web worker environments

// Check if we're in a worker context
const isWorker = typeof self !== 'undefined' && typeof window === 'undefined';

// Only apply in worker context and if Buffer is not already defined
if (isWorker && typeof self.Buffer === 'undefined') {
  console.log('[Worker] Applying Buffer polyfill in worker context');
  
  // Create a minimal Buffer implementation for workers
  self.Buffer = {
    from: function(data, encoding) {
      if (typeof data === 'string') {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(data);
        // Add toString method to the Uint8Array
        uint8Array.toString = function(encoding) {
          const decoder = new TextDecoder();
          return decoder.decode(this);
        };
        return uint8Array;
      }
      if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
      }
      return data;
    },
    
    isBuffer: function(obj) {
      return obj instanceof Uint8Array;
    },
    
    alloc: function(size) {
      return new Uint8Array(size);
    },
    
    concat: function(list, totalLength) {
      if (!Array.isArray(list)) {
        throw new TypeError('list argument must be an Array of Buffers');
      }
      
      if (list.length === 0) {
        return new Uint8Array(0);
      }
      
      let length = 0;
      for (const buf of list) {
        length += buf.length;
      }
      
      if (totalLength !== undefined) {
        length = Math.min(length, totalLength);
      }
      
      const result = new Uint8Array(length);
      let pos = 0;
      for (const buf of list) {
        const bufLength = Math.min(buf.length, length - pos);
        result.set(buf.subarray(0, bufLength), pos);
        pos += bufLength;
        if (pos >= length) break;
      }
      
      return result;
    }
  };
  
  console.log('[Worker] Buffer polyfill applied in worker context');
}

// Export for explicit imports
export const workerBufferPolyfill = {
  isApplied: isWorker && typeof self.Buffer !== 'undefined'
}; 