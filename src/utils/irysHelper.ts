/**
 * Helper functions for Irys integration
 */
import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { EthersV6Adapter } from "@irys/web-upload-ethereum-ethers-v6";
import { ethers } from "ethers";

// Ensure crypto polyfill is available
const ensureCryptoPolyfill = async () => {
  if (typeof window === 'undefined') return;
  
  try {
    // Modern approach using dynamic import instead of require
    if (typeof window.crypto === 'undefined' || typeof window.crypto.getRandomValues === 'undefined') {
      console.warn('[Irys] Native crypto API not fully available, using polyfill');
      
      // Import crypto-browserify dynamically
      const cryptoModule = await import('crypto-browserify');
      
      // @ts-ignore - Adding crypto polyfill
      window.crypto = window.crypto || {};
      
      // Ensure getRandomValues is available
      if (typeof window.crypto.getRandomValues === 'undefined') {
        // @ts-ignore - Adding getRandomValues polyfill
        window.crypto.getRandomValues = function(buffer: Uint8Array): Uint8Array {
          if (!buffer) throw new Error('Buffer cannot be null');
          const bytes = cryptoModule.randomBytes(buffer.byteLength);
          if (buffer instanceof Uint8Array) {
            buffer.set(new Uint8Array(bytes));
            return buffer;
          }
          throw new Error('Buffer must be a Uint8Array');
        };
      }
      
      // Add randomBytes directly to window.crypto for Irys
      // @ts-ignore - Adding randomBytes to window.crypto
      window.crypto.randomBytes = cryptoModule.randomBytes;
    }
    console.log('[Irys] Crypto polyfill check completed');
  } catch (err) {
    console.error('[Irys] Failed to ensure crypto polyfill:', err);
  }
};

// Initialize Irys with its own polyfill scope
export const initIrysEnvironment = async () => {
  console.log('[Irys] Initializing Irys environment');
  
  // Ensure Buffer is available for Irys
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    try {
      const bufferModule = await import('buffer');
      // @ts-ignore
      window.Buffer = bufferModule.Buffer;
      console.log('[Irys] Buffer polyfill loaded');
    } catch (err) {
      console.error('[Irys] Failed to load Buffer polyfill:', err);
    }
  }
  
  // Ensure crypto polyfill is available
  await ensureCryptoPolyfill();
  
  // Add direct access to crypto.randomBytes for Irys
  if (typeof window !== 'undefined' && typeof window.crypto !== 'undefined') {
    try {
      const cryptoModule = await import('crypto-browserify');
      // @ts-ignore - Adding randomBytes directly to crypto
      window.crypto.randomBytes = cryptoModule.randomBytes;
      console.log('[Irys] Added randomBytes to window.crypto');
    } catch (err) {
      console.error('[Irys] Failed to add randomBytes to window.crypto:', err);
    }
  }
};

/**
 * Create an Irys uploader instance
 */
export const createIrysUploader = async () => {
  if (typeof window === 'undefined' || !window.ethereum) {
    console.error("[Irys] No Ethereum provider found. Please install MetaMask or another wallet.");
    return null;
  }
  
  try {
    // Initialize environment first
    await initIrysEnvironment();
    
    // Create provider and uploader
    // @ts-ignore - ethereum provider type issues
    const provider = new ethers.BrowserProvider(window.ethereum);
    
    // Configure Irys with specific network settings
    const irysUploader = await WebUploader(WebEthereum).withAdapter(EthersV6Adapter(provider));
    
    // Use node1 for better reliability
    console.log(`[Irys] Connected to Irys: ${irysUploader.address}`);
    return irysUploader;
  } catch (error) {
    console.error("[Irys] Error creating Irys uploader:", error);
    return null;
  }
};

/**
 * Upload data to Irys
 */
export const uploadToIrys = async (
  data: string | any, // Using any for Buffer to avoid type issues
  tags: Array<{ name: string, value: string }> = []
) => {
  try {
    const uploader = await createIrysUploader();
    if (!uploader) {
      throw new Error("Failed to create Irys uploader");
    }
    
    // Add standard tags
    const standardTags = [
      { name: 'Content-Type', value: 'application/json' },
      { name: 'App-Name', value: 'Scarlett Tutor' },
      { name: 'App-Version', value: '1.0.0' },
      { name: 'Unix-Time', value: Date.now().toString() },
    ];
    
    // Combine user tags with standard tags
    const allTags = [...standardTags, ...tags];
    
    // Convert data to JSON string if it's an object
    const finalData = typeof data === 'object' && !(data instanceof Uint8Array) 
      ? JSON.stringify(data) 
      : data;
    
    // Upload the data with explicit options
    const receipt = await uploader.upload(finalData, { 
      tags: allTags,
    });
    
    console.log(`[Irys] Upload successful: ${receipt.id}`);
    console.log(`[Irys] View at: https://storage-explorer.irys.xyz/tx/${receipt.id}`);
    return receipt.id;
  } catch (error) {
    console.error("[Irys] Upload failed:", error);
    throw error;
  }
};

// Helper to convert Uint8Array to Buffer if needed
export const toBuffer = (data: Uint8Array): any => {
  if (typeof window !== 'undefined' && typeof window.Buffer !== 'undefined') {
    return Buffer.from(data);
  }
  throw new Error("Buffer is not available");
};

export default {
  initIrysEnvironment,
  createIrysUploader,
  uploadToIrys,
  toBuffer
}; 