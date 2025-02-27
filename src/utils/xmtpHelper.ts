/**
 * Helper functions for XMTP integration
 */

/**
 * Initialize XMTP environment
 * This function sets up the necessary global variables and polyfills for XMTP
 */
export const initXmtpEnvironment = () => {
  // Use globalThis to work in both browser and worker contexts
  const ctx = typeof globalThis !== 'undefined' ? globalThis : 
             typeof self !== 'undefined' ? self : 
             typeof global !== 'undefined' ? global : 
             {} as any;
  
  // Ensure global is defined
  if (typeof ctx.global === 'undefined') {
    // Use Object.defineProperty for safer assignment
    Object.defineProperty(ctx, 'global', {
      value: ctx,
      writable: true,
      configurable: true
    });
  }

  // Ensure process is defined
  if (typeof ctx.process === 'undefined') {
    // Use Object.defineProperty for safer assignment
    Object.defineProperty(ctx, 'process', {
      value: { env: {} },
      writable: true,
      configurable: true
    });
  }
  
  // Handle protobufjs
  if (typeof ctx.protobufjsWorkaround === 'undefined') {
    Object.defineProperty(ctx, 'protobufjsWorkaround', {
      value: true,
      writable: true,
      configurable: true
    });
  }
  
  console.log('XMTP environment initialized');
};

// Preload protobufjs
export const preloadProtobufjs = async () => {
  try {
    // Try to preload protobufjs
    const protobuf = await import('protobufjs/minimal');
    console.log('Protobufjs preloaded successfully');
    return protobuf;
  } catch (error) {
    console.error('Error preloading protobufjs:', error);
    throw error;
  }
};

export default initXmtpEnvironment; 