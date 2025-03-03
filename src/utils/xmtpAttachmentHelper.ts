/**
 * XMTP Attachment Helper
 * This file provides a safe way to import and use XMTP attachment codecs
 */

import { applyBufferPolyfill, isBufferAvailable } from './bufferPolyfill';

// Ensure Buffer is available
applyBufferPolyfill();

// Check if Buffer is available
if (!isBufferAvailable()) {
  console.error('Buffer is not available, XMTP attachments may not work correctly');
}

// Define placeholder types
let ContentTypeAttachment: any = null;
let AttachmentCodec: any = null;
let RemoteAttachmentCodec: any = null;
let ContentTypeRemoteAttachment: any = null;

// Flag to track if module is loaded
let isModuleLoaded = false;

/**
 * Ensure global Buffer is available
 */
const ensureBuffer = () => {
  if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
    try {
      const { Buffer } = require('buffer');
      // @ts-ignore
      window.Buffer = Buffer;
      console.log('Buffer polyfill loaded in attachment helper');
      return true;
    } catch (err) {
      console.error('Failed to load Buffer polyfill in attachment helper:', err);
      return false;
    }
  }
  return true;
};

/**
 * Load the XMTP attachment module
 * @returns A promise that resolves when the module is loaded
 */
export const loadXmtpAttachmentModule = async () => {
  if (isModuleLoaded) {
    return {
      ContentTypeAttachment,
      AttachmentCodec,
      RemoteAttachmentCodec,
      ContentTypeRemoteAttachment
    };
  }
  
  try {
    // Ensure Buffer is available before importing
    const bufferAvailable = ensureBuffer();
    if (!bufferAvailable) {
      throw new Error('Buffer is not available');
    }
    
    // Import the module
    const module = await import('@xmtp/content-type-remote-attachment');
    
    // Store the imported values
    ContentTypeAttachment = module.ContentTypeAttachment;
    AttachmentCodec = module.AttachmentCodec;
    RemoteAttachmentCodec = module.RemoteAttachmentCodec;
    ContentTypeRemoteAttachment = module.ContentTypeRemoteAttachment;
    
    isModuleLoaded = true;
    console.log('XMTP attachment module loaded successfully');
    
    return {
      ContentTypeAttachment,
      AttachmentCodec,
      RemoteAttachmentCodec,
      ContentTypeRemoteAttachment
    };
  } catch (error) {
    console.error('Failed to load XMTP attachment module:', error);
    
    // Create fallback implementations
    ContentTypeAttachment = {
      toString: () => 'attachment',
      sameAs: (other: any) => other && other.toString && other.toString() === 'attachment',
      codec: () => new FallbackAttachmentCodec()
    };
    
    class FallbackAttachmentCodec {
      contentType = 'attachment';
      encode(data: any) { return data; }
      decode(data: any) { return data; }
    }
    
    ContentTypeRemoteAttachment = {
      toString: () => 'remote-attachment',
      sameAs: (other: any) => other && other.toString && other.toString() === 'remote-attachment',
      codec: () => new FallbackRemoteAttachmentCodec()
    };
    
    class FallbackRemoteAttachmentCodec {
      contentType = 'remote-attachment';
      encode(data: any) { return data; }
      decode(data: any) { return data; }
      static load(data: any) { return Promise.resolve(data); }
      static encodeEncrypted(data: any) { return Promise.resolve(data); }
    }
    
    AttachmentCodec = FallbackAttachmentCodec;
    RemoteAttachmentCodec = FallbackRemoteAttachmentCodec;
    
    isModuleLoaded = true;
    console.warn('Using fallback XMTP attachment implementations');
    
    return {
      ContentTypeAttachment,
      AttachmentCodec,
      RemoteAttachmentCodec,
      ContentTypeRemoteAttachment
    };
  }
};

// Export the module
export {
  ContentTypeAttachment,
  AttachmentCodec,
  RemoteAttachmentCodec,
  ContentTypeRemoteAttachment
}; 