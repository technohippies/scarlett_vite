/**
 * XMTP Module Shim
 * This file provides a shim for XMTP modules that can be directly imported
 */

import { loadXmtpAttachmentModule } from './xmtpAttachmentHelper';

// Load the attachment module
let attachmentModule: any = null;

// Initialize the module
(async () => {
  try {
    attachmentModule = await loadXmtpAttachmentModule();
    console.log('XMTP module shim initialized with attachment module');
  } catch (error) {
    console.error('Failed to initialize XMTP module shim:', error);
  }
})();

// Export the constants from the attachment module
export const ContentTypeAttachment = {
  toString: () => 'xmtp.org/attachment:1.0',
  sameAs: (other: any) => other && other.toString && other.toString() === 'xmtp.org/attachment:1.0',
  codec: () => new AttachmentCodec()
};

export const ContentTypeRemoteAttachment = {
  toString: () => 'xmtp.org/remote-attachment:1.0',
  sameAs: (other: any) => other && other.toString && other.toString() === 'xmtp.org/remote-attachment:1.0',
  codec: () => new RemoteAttachmentCodec()
};

// Export the codecs
export class AttachmentCodec {
  contentType = 'xmtp.org/attachment:1.0';
  
  encode(attachment: any) {
    if (attachmentModule && attachmentModule.AttachmentCodec) {
      const codec = new attachmentModule.AttachmentCodec();
      return codec.encode(attachment);
    }
    return attachment;
  }
  
  decode(data: any) {
    // Prevent infinite recursion by checking if this is a repeated call
    if (attachmentModule && attachmentModule.AttachmentCodec && !AttachmentCodec.isDecoding) {
      try {
        // Set a flag to prevent recursive calls
        AttachmentCodec.isDecoding = true;
        const codec = new attachmentModule.AttachmentCodec();
        const result = codec.decode(data);
        return result;
      } finally {
        // Clear the flag when done
        AttachmentCodec.isDecoding = false;
      }
    }
    // Fallback: just return the data
    return data;
  }
  
  // Static property to prevent recursive calls
  static isDecoding = false;
}

export class RemoteAttachmentCodec {
  contentType = 'xmtp.org/remote-attachment:1.0';
  
  encode(attachment: any) {
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec) {
      const codec = new attachmentModule.RemoteAttachmentCodec();
      return codec.encode(attachment);
    }
    return attachment;
  }
  
  decode(data: any) {
    // Prevent infinite recursion by checking if this is a repeated call
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec && !RemoteAttachmentCodec.isDecoding) {
      try {
        // Set a flag to prevent recursive calls
        RemoteAttachmentCodec.isDecoding = true;
        const codec = new attachmentModule.RemoteAttachmentCodec();
        const result = codec.decode(data);
        return result;
      } finally {
        // Clear the flag when done
        RemoteAttachmentCodec.isDecoding = false;
      }
    }
    // Fallback: just return the data
    return data;
  }
  
  // Static property to prevent recursive calls
  static isDecoding = false;
  
  static async load(data: any) {
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec) {
      return attachmentModule.RemoteAttachmentCodec.load(data);
    }
    return Promise.resolve(data);
  }
  
  static async encodeEncrypted(data: any) {
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec) {
      return attachmentModule.RemoteAttachmentCodec.encodeEncrypted(data);
    }
    return Promise.resolve(data);
  }
}

// Add the module to the window object for direct access
if (typeof window !== 'undefined') {
  // @ts-ignore
  window.xmtpModules = window.xmtpModules || {};
  // @ts-ignore
  window.xmtpModules['@xmtp/content-type-remote-attachment'] = {
    ContentTypeAttachment,
    ContentTypeRemoteAttachment,
    AttachmentCodec,
    RemoteAttachmentCodec
  };
}

// Function to get the module
export function getModule(moduleName: string) {
  if (moduleName === '@xmtp/content-type-remote-attachment') {
    return {
      ContentTypeAttachment,
      ContentTypeRemoteAttachment,
      AttachmentCodec,
      RemoteAttachmentCodec
    };
  }
  return null;
} 