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
  wordTimestamps?: {
    text: string;
    start_time: number;
    end_time: number;
  }[];
  pairId?: string;
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
  private pendingAudioMessages: Map<string, XmtpMessage> = new Map();
  private pendingTextMessages: Map<string, XmtpMessage> = new Map();
  private botAddress = "0xB0dD2a6FAB0180C8b2fc4f144273Cc693d7896Ed"; 

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
    this.pendingAudioMessages.clear();
    this.pendingTextMessages.clear();
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
    let wordTimestamps = undefined;
    let pairId = undefined;
    
    if (isTextMessage) {
      try {
        if (typeof message.content === 'string') {
          // Try to parse as JSON if it looks like JSON
          if (message.content.trim().startsWith('{') && message.content.trim().endsWith('}')) {
            try {
              const jsonContent = JSON.parse(message.content);
              console.log('Parsed JSON content:', jsonContent);
              
              // Check if it's our audio response format
              if (jsonContent.message_type === 'audio_response' && jsonContent.content) {
                displayContent = jsonContent.content.text || "Audio message";
                
                // Extract word timestamps if available
                if (jsonContent.content.word_timestamps) {
                  wordTimestamps = jsonContent.content.word_timestamps;
                }
                
                // Extract pair ID if available
                if (jsonContent.content.pair_id) {
                  pairId = jsonContent.content.pair_id;
                  console.log('Found pair ID in text message:', pairId);
                }
              } else {
                displayContent = message.content;
              }
            } catch (e) {
              // Not valid JSON, use as is
              console.error('Error parsing JSON:', e);
              displayContent = message.content;
            }
          } else {
            displayContent = message.content;
          }
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
            
            // Extract word timestamps if available
            if (jsonContent.word_timestamps) {
              wordTimestamps = jsonContent.word_timestamps;
            }
            
            // Extract pair ID if available
            if (jsonContent.pair_id) {
              pairId = jsonContent.pair_id;
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
            
            // Try to extract pair ID from filename
            if (attachment.filename && attachment.filename.startsWith('response-') && attachment.filename.endsWith('.mp3')) {
              const potentialPairId = attachment.filename.replace('response-', '').replace('.mp3', '');
              if (potentialPairId.match(/^[0-9a-f-]+$/)) {
                pairId = potentialPairId;
                console.log('Found pair ID in audio filename:', pairId);
              }
            }
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
    
    // Create the processed message
    const processedMessage: XmtpMessage = {
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
      normalized_alignment,
      wordTimestamps,
      pairId
    };
    
    // Check if this message has a pair ID and needs to be paired
    if (pairId) {
      // If it's an audio message
      if (audioUrl && !wordTimestamps) {
        console.log('Storing audio message with pair ID:', pairId);
        this.pendingAudioMessages.set(pairId, processedMessage);
        
        // Check if we have a matching text message
        const matchingTextMessage = this.pendingTextMessages.get(pairId);
        if (matchingTextMessage) {
          console.log('Found matching text message for pair ID:', pairId);
          // Combine the messages
          const combinedMessage: XmtpMessage = {
            ...matchingTextMessage,
            audioUrl: processedMessage.audioUrl,
            id: processedMessage.id, // Use the latest message ID
            sentAt: processedMessage.sentAt // Use the latest timestamp
          };
          
          // Remove the pending messages
          this.pendingTextMessages.delete(pairId);
          this.pendingAudioMessages.delete(pairId);
          
          return combinedMessage;
        }
        
        // No matching text message yet, return null and wait
        return null;
      }
      
      // If it's a text message with word timestamps
      if (wordTimestamps && !audioUrl) {
        console.log('Storing text message with pair ID:', pairId);
        this.pendingTextMessages.set(pairId, processedMessage);
        
        // Check if we have a matching audio message
        const matchingAudioMessage = this.pendingAudioMessages.get(pairId);
        if (matchingAudioMessage) {
          console.log('Found matching audio message for pair ID:', pairId);
          // Combine the messages
          const combinedMessage: XmtpMessage = {
            ...processedMessage,
            audioUrl: matchingAudioMessage.audioUrl,
            id: processedMessage.id, // Use the latest message ID
            sentAt: processedMessage.sentAt // Use the latest timestamp
          };
          
          // Remove the pending messages
          this.pendingTextMessages.delete(pairId);
          this.pendingAudioMessages.delete(pairId);
          
          return combinedMessage;
        }
        
        // No matching audio message yet, return null and wait
        return null;
      }
    }
    
    // If the message doesn't have a pair ID or already has both audio and word timestamps, return it as is
    return processedMessage;
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
      const botConversations = await Promise.all(
        conversations.map(async conv => {
          // Check if it's a DM and has the right peer address
          if ('peerInboxId' in conv) {
            // peerInboxId is a function that returns a Promise<string>
            const peerAddress = await conv.peerInboxId();
            return peerAddress === this.botAddress ? conv : null;
          }
          return null;
        })
      );
      
      const botConversation = botConversations.find(conv => conv !== null);
      
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
      const botConversations = await Promise.all(
        conversations.map(async conv => {
          // Check if it's a DM and has the right peer address
          if ('peerInboxId' in conv) {
            // peerInboxId is a function that returns a Promise<string>
            const peerAddress = await conv.peerInboxId();
            return peerAddress === this.botAddress ? conv : null;
          }
          return null;
        })
      );
      
      const botConversation = botConversations.find(conv => conv !== null);
      
      if (!botConversation) {
        return [];
      }
      
      // Load messages
      const messages = await botConversation.messages({ limit: 30n });
      
      const processedMessages: XmtpMessage[] = [];
      
      // First pass: process all messages and collect paired messages
      for (const message of messages) {
        const processedMessage = this.processMessage(message);
        if (processedMessage && !processedMessage.pairId) {
          // If the message doesn't have a pair ID, add it directly
          processedMessages.push(processedMessage);
        }
      }
      
      // Second pass: add any remaining paired messages that were successfully combined
      for (const message of messages) {
        const processedMessage = this.processMessage(message);
        if (processedMessage && processedMessage.pairId) {
          // Check if this message has both audio and word timestamps
          if (processedMessage.audioUrl && processedMessage.wordTimestamps) {
            // Check if we already have this message (by pair ID)
            const existingIndex = processedMessages.findIndex(m => m.pairId === processedMessage.pairId);
            if (existingIndex >= 0) {
              // Replace the existing message
              processedMessages[existingIndex] = processedMessage;
            } else {
              // Add as a new message
              processedMessages.push(processedMessage);
            }
          }
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