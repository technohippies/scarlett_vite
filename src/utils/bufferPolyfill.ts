/**
 * Buffer Polyfill
 * This file provides a polyfill for the Buffer class in browser environments
 */

// Check if Buffer is already defined globally
const isBufferDefined = typeof globalThis !== 'undefined' && 
                        typeof (globalThis as any).Buffer !== 'undefined';

/**
 * Apply Buffer polyfill if not already available
 * @returns true if polyfill was applied, false if Buffer was already defined
 */
export const applyBufferPolyfill = (): boolean => {
  if (isBufferDefined) {
    console.log('Buffer is already defined, skipping polyfill');
    return false;
  }

  try {
    // Try to load Buffer from the buffer module
    const bufferModule = require('buffer');
    if (typeof window !== 'undefined') {
      // @ts-ignore - Adding Buffer to window
      window.Buffer = bufferModule.Buffer;
      console.log('Buffer polyfill loaded from buffer module');
      return true;
    }
  } catch (error) {
    console.error('Failed to load Buffer from buffer module:', error);
    
    // Fallback to a minimal implementation
    if (typeof window !== 'undefined') {
      // @ts-ignore - Adding Buffer to window
      window.Buffer = createMinimalBuffer();
      console.log('Minimal Buffer polyfill loaded');
      return true;
    }
  }
  
  return false;
};

/**
 * Create a minimal Buffer implementation
 * This is a very basic implementation that covers the most common use cases
 */
const createMinimalBuffer = () => {
  const MinimalBuffer = {
    from: (data: string | ArrayBuffer | Uint8Array, encoding?: string): Uint8Array => {
      if (typeof data === 'string') {
        const encoder = new TextEncoder();
        const uint8Array = encoder.encode(data);
        
        // Add toString method to the Uint8Array
        Object.defineProperty(uint8Array, 'toString', {
          value: function(encoding?: string) {
            const decoder = new TextDecoder();
            return decoder.decode(this);
          },
          enumerable: false
        });
        
        return uint8Array;
      }
      
      if (data instanceof ArrayBuffer) {
        return new Uint8Array(data);
      }
      
      return data;
    },
    
    isBuffer: (obj: any): boolean => {
      return obj instanceof Uint8Array;
    },
    
    alloc: (size: number): Uint8Array => {
      const buffer = new Uint8Array(size);
      return buffer;
    },
    
    concat: (list: Uint8Array[], totalLength?: number): Uint8Array => {
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
  
  return MinimalBuffer;
};

// Apply the polyfill immediately when this module is imported
applyBufferPolyfill();

// Export a function to check if Buffer is available
export const isBufferAvailable = (): boolean => {
  return typeof window !== 'undefined' && typeof window.Buffer !== 'undefined';
};

// Export the Buffer for convenience if available
export const getBuffer = () => {
  if (typeof window !== 'undefined' && window.Buffer) {
    return window.Buffer;
  }
  return undefined;
}; 