/**
 * Helper functions for Irys integration
 */
import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { EthersV6Adapter } from "@irys/web-upload-ethereum-ethers-v6";
import { ethers } from "ethers";

// Ensure crypto polyfill is available
const ensureCryptoPolyfill = () => {
  if (typeof window === 'undefined') return;
  
  try {
    // Check if crypto-browserify is available
    const cryptoCheck = require('crypto-browserify');
    if (typeof window.crypto === 'undefined' || typeof window.crypto.getRandomValues === 'undefined') {
      console.warn('[Irys] Native crypto API not fully available, using polyfill');
      // @ts-ignore - Adding crypto polyfill
      window.crypto = window.crypto || {};
      // Ensure getRandomValues is available
      if (typeof window.crypto.getRandomValues === 'undefined') {
        // @ts-ignore - Adding getRandomValues polyfill
        window.crypto.getRandomValues = function(buffer) {
          const bytes = cryptoCheck.randomBytes(buffer.length);
          buffer.set(new Uint8Array(bytes.buffer));
          return buffer;
        };
      }
    }
    console.log('[Irys] Crypto polyfill check completed');
  } catch (err) {
    console.error('[Irys] Failed to ensure crypto polyfill:', err);
  }
};

// Initialize Irys with its own polyfill scope
export const initIrysEnvironment = () => {
  console.log('[Irys] Initializing Irys environment');
  
  // Ensure Buffer is available for Irys
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    try {
      const { Buffer } = require('buffer');
      // @ts-ignore
      window.Buffer = Buffer;
      console.log('[Irys] Buffer polyfill loaded');
    } catch (err) {
      console.error('[Irys] Failed to load Buffer polyfill:', err);
    }
  }
  
  // Ensure crypto polyfill is available
  ensureCryptoPolyfill();
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
    initIrysEnvironment();
    
    // Create provider and uploader
    // @ts-ignore - ethereum provider type issues
    const provider = new ethers.BrowserProvider(window.ethereum);
    const irysUploader = await WebUploader(WebEthereum).withAdapter(EthersV6Adapter(provider));
    
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
    
    // Upload the data
    const receipt = await uploader.upload(data, { tags });
    console.log(`[Irys] Upload successful: ${receipt.id}`);
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