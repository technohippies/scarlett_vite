/**
 * Helper functions for XMTP integration
 */

/**
 * Initialize XMTP environment
 * This function sets up the necessary global variables and polyfills for XMTP
 */
export const initXmtpEnvironment = () => {
  // Set up any global configurations for XMTP here
  console.log('[XMTP] Initializing XMTP environment');
  
  // Check for SharedArrayBuffer support
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasAtomics = typeof Atomics !== 'undefined';
  
  console.log(`[XMTP] Environment check: SharedArrayBuffer: ${hasSharedArrayBuffer}, Atomics: ${hasAtomics}`);
  
  // Add warning if SharedArrayBuffer is not available
  if (!hasSharedArrayBuffer || !hasAtomics) {
    console.warn('[XMTP] Missing SharedArrayBuffer and/or Atomics. XMTP WASM may not work correctly. The server must emit the COOP/COEP response headers to enable those.');
  }
  
  // Ensure Buffer is available
  ensureBufferPolyfill();
  
  // Preload protobufjs to avoid issues
  preloadProtobufjs();
  
  // Add diagnostic tools to window for debugging
  if (typeof window !== 'undefined') {
    // Add diagnostic tools to window
    (window as any).xmtpDiagnostics = {
      clearXmtpData: clearXmtpData,
      checkSignatureFormat: checkSignatureFormat,
      testSignature: testSignature,
      getLocalStorageKeys: getLocalStorageKeys,
      checkEnvironment: () => ({
        hasSharedArrayBuffer,
        hasAtomics,
        headers: {
          coep: getHeaderValue('cross-origin-embedder-policy'),
          coop: getHeaderValue('cross-origin-opener-policy'),
          corp: getHeaderValue('cross-origin-resource-policy')
        }
      })
    };
    
    console.log('[XMTP] Diagnostic tools added to window.xmtpDiagnostics');
  }
};

// Ensure Buffer polyfill is available
const ensureBufferPolyfill = () => {
  if (typeof window === 'undefined') return;
  
  // Make sure Buffer is available globally
  if (typeof window.Buffer === 'undefined') {
    try {
      const { Buffer } = require('buffer');
      // @ts-ignore
      window.Buffer = Buffer;
      console.log('[XMTP] Buffer polyfill loaded');
    } catch (error) {
      console.error('[XMTP] Failed to load Buffer polyfill:', error);
    }
  } else {
    console.log('[XMTP] Buffer is already available globally');
  }
};

// Helper to get header values
const getHeaderValue = (headerName: string): string | null => {
  try {
    if (typeof document !== 'undefined') {
      return document.querySelector(`meta[http-equiv="${headerName}"]`)?.getAttribute('content') || null;
    }
  } catch (e) {
    console.error('[XMTP] Error getting header:', e);
  }
  return null;
};

// Preload protobufjs to avoid issues with dynamic imports
const preloadProtobufjs = () => {
  try {
    // This is a workaround for issues with protobufjs in some environments
    // It ensures the library is loaded before it's needed
    import('protobufjs').catch(e => {
      console.warn('[XMTP] Failed to preload protobufjs:', e);
    });
    
    // Also try to preload buffer if needed
    if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
      import('buffer').then(({ Buffer }) => {
        // @ts-ignore - Adding Buffer to window
        window.Buffer = Buffer;
        console.log('[XMTP] Buffer polyfill loaded in preloadProtobufjs');
      }).catch(err => {
        console.error('[XMTP] Failed to load Buffer polyfill in preloadProtobufjs:', err);
      });
    }
  } catch (error) {
    console.warn('[XMTP] Error preloading protobufjs:', error);
  }
};

// Clear all XMTP-related data from localStorage
const clearXmtpData = (address?: string) => {
  console.log('[XMTP] Clearing XMTP data from localStorage');
  
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    // If address is provided, only clear data for that address
    if (address) {
      const lowerAddress = address.toLowerCase();
      if (
        key.startsWith(`xmtp-key-${lowerAddress}`) || 
        key.startsWith(`xmtp-client-${lowerAddress}`) ||
        key.startsWith(`xmtp-signature-${lowerAddress}`)
      ) {
        keysToRemove.push(key);
      }
    } else {
      // Otherwise clear all XMTP data
      if (
        key.startsWith('xmtp-key-') || 
        key.startsWith('xmtp-client-') ||
        key.startsWith('xmtp-signature-')
      ) {
        keysToRemove.push(key);
      }
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  console.log(`[XMTP] Cleared ${keysToRemove.length} items from localStorage`);
  return keysToRemove;
};

// Check the format of a signature
const checkSignatureFormat = (signature: string) => {
  if (!signature) {
    return { valid: false, error: 'Signature is empty' };
  }
  
  const isHex = signature.startsWith('0x');
  const length = signature.length;
  const byteLength = isHex ? (length - 2) / 2 : null;
  
  // For Ethereum signatures, they should be 0x + 65 bytes (130 hex chars) = 132 chars total
  const isStandardEthLength = isHex && length === 132;
  
  return {
    valid: isHex && isStandardEthLength,
    isHex,
    length,
    byteLength,
    isStandardEthLength,
    prefix: signature.substring(0, 10),
    suffix: signature.substring(signature.length - 10)
  };
};

// Test signature with a wallet
const testSignature = async (message: string = 'Test message for XMTP signature validation') => {
  if (typeof window === 'undefined') {
    return { success: false, error: 'No window object found' };
  }
  
  const ethereum = (window as any).ethereum;
  if (!ethereum) {
    return { success: false, error: 'No Ethereum provider found' };
  }
  
  try {
    // Request accounts
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    if (!accounts || accounts.length === 0) {
      return { success: false, error: 'No accounts found' };
    }
    
    const address = accounts[0];
    console.log(`[XMTP] Testing signature with address: ${address}`);
    
    // Sign message
    const signature = await ethereum.request({
      method: 'personal_sign',
      params: [message, address]
    });
    
    console.log(`[XMTP] Signature result:`, signature);
    
    // Check signature format
    const formatCheck = checkSignatureFormat(signature);
    
    return {
      success: true,
      address,
      signature,
      formatCheck
    };
  } catch (error) {
    console.error('[XMTP] Error testing signature:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

// Get all localStorage keys related to XMTP
const getLocalStorageKeys = () => {
  const keys = {
    all: [] as string[],
    byType: {
      keys: [] as string[],
      clients: [] as string[],
      signatures: [] as string[],
      other: [] as string[]
    }
  };
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    
    keys.all.push(key);
    
    if (key.startsWith('xmtp-key-')) {
      keys.byType.keys.push(key);
    } else if (key.startsWith('xmtp-client-')) {
      keys.byType.clients.push(key);
    } else if (key.startsWith('xmtp-signature-')) {
      keys.byType.signatures.push(key);
    } else {
      keys.byType.other.push(key);
    }
  }
  
  return keys;
};

export default initXmtpEnvironment; 