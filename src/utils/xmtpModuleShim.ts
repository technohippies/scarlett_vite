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
  toString: () => 'attachment',
  sameAs: (other: any) => other && other.toString && other.toString() === 'attachment',
  codec: () => new AttachmentCodec()
};

export const ContentTypeRemoteAttachment = {
  toString: () => 'remote-attachment',
  sameAs: (other: any) => other && other.toString && other.toString() === 'remote-attachment',
  codec: () => new RemoteAttachmentCodec()
};

// Export the codecs
export class AttachmentCodec {
  contentType = 'attachment';
  
  encode(attachment: any) {
    if (attachmentModule && attachmentModule.AttachmentCodec) {
      const codec = new attachmentModule.AttachmentCodec();
      return codec.encode(attachment);
    }
    return attachment;
  }
  
  decode(data: any) {
    if (attachmentModule && attachmentModule.AttachmentCodec) {
      const codec = new attachmentModule.AttachmentCodec();
      return codec.decode(data);
    }
    return data;
  }
}

export class RemoteAttachmentCodec {
  contentType = 'remote-attachment';
  
  encode(attachment: any) {
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec) {
      const codec = new attachmentModule.RemoteAttachmentCodec();
      return codec.encode(attachment);
    }
    return attachment;
  }
  
  decode(data: any) {
    if (attachmentModule && attachmentModule.RemoteAttachmentCodec) {
      const codec = new attachmentModule.RemoteAttachmentCodec();
      return codec.decode(data);
    }
    return data;
  }
  
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