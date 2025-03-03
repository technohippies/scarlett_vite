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
    console.log('XMTP attachment module already loaded, reusing');
    return {
      ContentTypeAttachment,
      AttachmentCodec,
      RemoteAttachmentCodec,
      ContentTypeRemoteAttachment
    };
  }
  
  try {
    // Double check Buffer is available and apply polyfill if needed
    const bufferAvailable = ensureBuffer();
    if (!bufferAvailable) {
      console.warn('Buffer not available, attempting polyfill again');
      // Try to explicitly load Buffer from the imported package
      try {
        const Buffer = require('buffer').Buffer;
        // Assign to global/window scope
        if (typeof window !== 'undefined') {
          window.Buffer = Buffer;
          console.log('Buffer applied from direct import');
        } else if (typeof global !== 'undefined') {
          global.Buffer = Buffer;
          console.log('Buffer applied to global scope');
        }
      } catch (e) {
        console.error('Failed to load Buffer from package:', e);
        throw new Error('Buffer is required for attachments to work');
      }
    }
    
    // Force a synchronous check to ensure Buffer is available
    if (typeof Buffer === 'undefined') {
      if (typeof window !== 'undefined' && window.Buffer) {
        // @ts-ignore
        globalThis.Buffer = window.Buffer;
        console.log('Copied Buffer from window to globalThis');
      } else {
        throw new Error('Buffer is still not available after polyfill');
      }
    }
    
    // Import the module
    console.log('Importing content-type-remote-attachment module...');
    const module = await import('@xmtp/content-type-remote-attachment');
    console.log('Module imported successfully:', Object.keys(module));
    
    // Store the imported values
    ContentTypeAttachment = module.ContentTypeAttachment;
    AttachmentCodec = module.AttachmentCodec;
    RemoteAttachmentCodec = module.RemoteAttachmentCodec;
    ContentTypeRemoteAttachment = module.ContentTypeRemoteAttachment;
    
    // Validate that we have actual working implementations
    if (!AttachmentCodec || typeof AttachmentCodec !== 'function') {
      console.error('AttachmentCodec is not a constructor:', AttachmentCodec);
      throw new Error('Invalid AttachmentCodec implementation');
    }
    
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
    
    // Create more robust fallback implementations
    console.warn('Using fallback XMTP attachment implementations');
    
    // Create fallback implementations
    ContentTypeAttachment = {
      toString: () => 'xmtp.org/attachment:1.0',
      sameAs: (other: any) => other && other.toString && other.toString() === 'xmtp.org/attachment:1.0',
      codec: () => new FallbackAttachmentCodec()
    };
    
    class FallbackAttachmentCodec {
      contentType = 'xmtp.org/attachment:1.0';
      encode(data: any) { return data; }
      decode(data: any) { return data; }
    }
    
    ContentTypeRemoteAttachment = {
      toString: () => 'xmtp.org/remote-attachment:1.0',
      sameAs: (other: any) => other && other.toString && other.toString() === 'xmtp.org/remote-attachment:1.0',
      codec: () => new FallbackRemoteAttachmentCodec()
    };
    
    class FallbackRemoteAttachmentCodec {
      contentType = 'xmtp.org/remote-attachment:1.0';
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