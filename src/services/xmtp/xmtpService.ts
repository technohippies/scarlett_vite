import { Client, type Signer, DecodedMessage } from "@xmtp/browser-sdk";
import { ethers } from "ethers";
import {
  ContentTypeAttachment,
  AttachmentCodec,
  RemoteAttachmentCodec,
  ContentTypeRemoteAttachment,
} from "@xmtp/content-type-remote-attachment";
import { authService } from "../silk/authService";

// Types
export interface XmtpMessage {
  id: string;
  conversationId: string;
  senderAddress: string;
  content: string;
  contentType: string;
  sentAt: string;
  isFromMe: boolean;
  isFromBot: boolean;
  audioUrl?: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
  normalized_alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

export interface XmtpConversation {
  id: string;
  messages: XmtpMessage[];
}

// XMTP Service class
class XmtpService {
  private client: Client | null = null;
  private messageStreams: any[] = [];
  private connectionTimestamp: number = 0;
  private processedMessageIds: Set<string> = new Set();
  private botAddress = "0x937C0d4a6294cdfa575de17382c7076b579DC176"; // gm.xmtp.eth

  // Connect to XMTP
  async connect(): Promise<{ success: boolean; error?: string; address?: string }> {
    try {
      // Check if already authenticated with wallet
      if (!authService.isConnected()) {
        return { success: false, error: "Not connected to wallet" };
      }

      // Set connection timestamp
      this.connectionTimestamp = Date.now();
      
      // Get the user's address and signer from auth service
      const userAddress = authService.getUserAddress();
      const ethersSigner = authService.getSigner();
      
      if (!userAddress || !ethersSigner) {
        return { success: false, error: "Failed to get wallet details" };
      }

      // Create a signer for XMTP using ethers
      const signer: Signer = {
        getAddress: async () => userAddress,
        signMessage: async (message: string) => {
          try {
            // Use ethers for consistent signing
            const signature = await ethersSigner.signMessage(message);
            
            // Convert the hex signature to Uint8Array as required by XMTP
            const signatureBytes = ethers.utils.arrayify(signature);
            
            return signatureBytes;
          } catch (err) {
            console.error("Error signing message:", err);
            throw err;
          }
        },
        walletType: "EOA",
      };

      // Generate a random encryption key for the local database
      const encryptionKey = window.crypto.getRandomValues(new Uint8Array(32));
      
      // Create the XMTP client with codecs
      this.client = await Client.create(
        signer,
        encryptionKey,
        {
          env: "dev", // Use "production" for production
          codecs: [
            new AttachmentCodec(),
            new RemoteAttachmentCodec()
          ]
        }
      );

      return { success: true, address: userAddress };
    } catch (error) {
      console.error("Error connecting to XMTP:", error);
      let errorMessage = "Failed to connect to XMTP";
      
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      } else {
        errorMessage += `: ${String(error)}`;
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Disconnect from XMTP
  disconnect() {
    this.client = null;
    this.closeAllStreams();
    this.processedMessageIds.clear();
  }

  // Close all message streams
  private closeAllStreams() {
    for (const stream of this.messageStreams) {
      if (stream && typeof stream.return === 'function') {
        stream.return();
      }
    }
    this.messageStreams = [];
  }

  // Check if connected to XMTP
  isConnected(): boolean {
    return !!this.client;
  }

  // Get user address
  getUserAddress(): string {
    return authService.getUserAddress();
  }

  // Send a message to the bot
  async sendMessage(audioData: Blob): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.client) {
        return { success: false, error: "Not connected to XMTP" };
      }
      
      // Check if audio data is too large (1MB limit)
      if (audioData.size > 1024 * 1024) {
        return { success: false, error: "Audio file is too large (max 1MB)" };
      }
      
      // Create conversation with the bot
      const conversation = await this.client.conversations.newDm(this.botAddress);
      
      // Convert Blob to Uint8Array
      const arrayBuffer = await audioData.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      
      // Create attachment from audio data
      const attachment = {
        filename: "audio.webm",
        mimeType: "audio/webm",
        data: uint8Array
      };
      
      // Send the attachment
      await conversation.send(attachment, ContentTypeAttachment);
      
      return { success: true };
    } catch (error) {
      console.error("Error sending message:", error);
      
      let errorMessage = "Failed to send message";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Process a message
  private processMessage(message: DecodedMessage): XmtpMessage | null {
    if (!message) return null;
    
    // Check if we've already processed this message
    const messageKey = `${message.id}-${message.conversationId}`;
    if (this.processedMessageIds.has(messageKey)) {
      return null;
    }
    
    // Mark this message as processed
    this.processedMessageIds.add(messageKey);
    
    // Format sent time from nanoseconds
    const sentAt = message.sentAtNs ? 
      new Date(Number(message.sentAtNs / BigInt(1000000))).toISOString() : 
      'unknown';
    
    // Get message timestamp in milliseconds for comparison
    const messageSentTimestamp = message.sentAtNs ? 
      Number(message.sentAtNs / BigInt(1000000)) : 
      0;
    
    // Check if this is a new message (sent after we connected)
    const isNewMessage = messageSentTimestamp > this.connectionTimestamp;
    
    // Check if this is from the bot
    const isFromBot = message.senderInboxId === this.botAddress;
    
    const userAddress = authService.getUserAddress();
    
    // Check if this is a text message
    const isTextMessage = message.contentType?.typeId === 'text' || 
                         (typeof message.content === 'string');
    
    // Check if this is an attachment (audio, image, etc.)
    const isAttachment = message.contentType?.typeId === 'attachment' || 
                        (message.contentType?.authorityId === 'xmtp.org' && 
                         message.contentType?.typeId === 'attachment');
    
    // Create a more user-friendly display for the message
    let displayContent = '';
    let audioUrl: string | null = null;
    let alignment = undefined;
    let normalized_alignment = undefined;
    
    if (isTextMessage) {
      try {
        if (typeof message.content === 'string') {
          displayContent = message.content;
        } else if (message.content && typeof message.content === 'object') {
          // Try to parse as JSON
          const jsonContent = message.content as any;
          
          if (jsonContent.audio_base64) {
            // This is a response with audio and alignment
            displayContent = jsonContent.text || "Audio message";
            
            // Create audio URL from base64
            const audioBlob = this.base64ToBlob(jsonContent.audio_base64, 'audio/mp3');
            audioUrl = URL.createObjectURL(audioBlob);
            
            // Extract alignment data
            if (jsonContent.alignment) {
              alignment = jsonContent.alignment;
            }
            
            if (jsonContent.normalized_alignment) {
              normalized_alignment = jsonContent.normalized_alignment;
            }
          } else {
            // Regular JSON content
            displayContent = JSON.stringify(jsonContent);
          }
        } else {
          displayContent = String(message.content);
        }
      } catch (e) {
        console.error("Error processing text message:", e);
        displayContent = typeof message.content === 'string' ? message.content : "Error processing message content";
      }
    } else if (isAttachment) {
      // Handle attachment content
      try {
        if (message.content && typeof message.content === 'object') {
          const attachment = message.content as any;
          
          // Check if this is an audio attachment
          const isAudio = attachment.mimeType && attachment.mimeType.startsWith('audio/');
          
          if (isAudio && attachment.data) {
            // Create a blob from the audio data
            const audioBlob = new Blob([attachment.data], { type: attachment.mimeType });
            audioUrl = URL.createObjectURL(audioBlob);
            
            // Set display content to indicate it's an audio message
            displayContent = `🔊 Audio message: ${attachment.filename || 'audio file'}`;
          } else {
            // For non-audio attachments, just show the filename
            displayContent = `📎 Attachment: ${attachment.filename || 'file'} (${attachment.mimeType || 'unknown type'})`;
          }
        } else {
          displayContent = `📎 Attachment (format not recognized)`;
        }
      } catch (e) {
        console.error("Error processing attachment:", e);
        displayContent = `📎 Attachment (error processing)`;
      }
    } else {
      // For non-text, non-attachment messages, try to extract useful content
      if (typeof message.content === 'object' && message.content !== null) {
        // Try to stringify the content for display
        try {
          displayContent = JSON.stringify(message.content);
        } catch (e) {
          displayContent = `[${message.contentType?.typeId || 'Unknown'} message - cannot display content]`;
        }
      } else {
        displayContent = `[${message.contentType?.typeId || 'Unknown'} message]`;
      }
    }
    
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderAddress: message.senderInboxId || 'unknown',
      content: displayContent,
      contentType: message.contentType?.typeId || 'unknown',
      sentAt,
      isFromMe: message.senderInboxId === userAddress,
      isFromBot,
      audioUrl: audioUrl || undefined,
      alignment,
      normalized_alignment
    };
  }

  // Convert base64 to Blob
  private base64ToBlob(base64: string, mimeType: string): Blob {
    const byteCharacters = atob(base64);
    const byteArrays = [];
    
    for (let offset = 0; offset < byteCharacters.length; offset += 512) {
      const slice = byteCharacters.slice(offset, offset + 512);
      
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      
      const byteArray = new Uint8Array(byteNumbers);
      byteArrays.push(byteArray);
    }
    
    return new Blob(byteArrays, { type: mimeType });
  }

  // Start listening for messages
  async startMessageListener(
    onNewMessage: (message: XmtpMessage) => void
  ): Promise<boolean> {
    if (!this.client) return false;
    
    try {
      // List existing conversations
      const conversations = await this.client.conversations.list();
      
      // Find conversation with the bot
      const botConversation = conversations.find(conv => {
        // Check if it's a DM and has the right peer address
        if ('peerInboxId' in conv) {
          return conv.peerInboxId === this.botAddress;
        }
        return false;
      });
      
      if (botConversation) {
        // Stream messages for the bot conversation
        const convStream = await botConversation.stream();
        this.messageStreams.push(convStream);
        
        // Listen for messages in this conversation
        (async () => {
          try {
            for await (const message of convStream) {
              if (message) {  // Check if message is defined
                const processedMessage = this.processMessage(message);
                if (processedMessage) {
                  onNewMessage(processedMessage);
                }
              }
            }
          } catch (error) {
            console.error(`Error in conversation stream:`, error);
          }
        })();
      } else {
        // No existing conversation with the bot, create one
        const newConversation = await this.client.conversations.newDm(this.botAddress);
        
        // Stream messages for the new conversation
        const convStream = await newConversation.stream();
        this.messageStreams.push(convStream);
        
        // Listen for messages in this conversation
        (async () => {
          try {
            for await (const message of convStream) {
              if (message) {  // Check if message is defined
                const processedMessage = this.processMessage(message);
                if (processedMessage) {
                  onNewMessage(processedMessage);
                }
              }
            }
          } catch (error) {
            console.error(`Error in new conversation stream:`, error);
          }
        })();
      }
      
      return true;
    } catch (error) {
      console.error("Failed to start message streams:", error);
      return false;
    }
  }

  // Load conversation history with the bot
  async loadConversationWithBot(): Promise<XmtpMessage[]> {
    if (!this.client) return [];
    
    try {
      // List existing conversations
      const conversations = await this.client.conversations.list();
      
      // Find conversation with the bot
      const botConversation = conversations.find(conv => {
        // Check if it's a DM and has the right peer address
        if ('peerInboxId' in conv) {
          return conv.peerInboxId === this.botAddress;
        }
        return false;
      });
      
      if (!botConversation) {
        return [];
      }
      
      // Load messages
      const messages = await botConversation.messages({ limit: 30n });
      
      const processedMessages: XmtpMessage[] = [];
      for (const message of messages) {
        const processedMessage = this.processMessage(message);
        if (processedMessage) {
          processedMessages.push(processedMessage);
        }
      }
      
      return processedMessages;
    } catch (error) {
      console.error("Error loading conversation with bot:", error);
      return [];
    }
  }
}

// Export a singleton instance
export const xmtpService = new XmtpService(); 