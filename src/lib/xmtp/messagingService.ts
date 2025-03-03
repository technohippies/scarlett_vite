/**
 * XMTP Messaging Service
 * 
 * This service provides unified handling of XMTP messaging functionality,
 * including bot detection, message streaming, and message sending.
 * It's designed to be used by the ChatPage component.
 */

import { inspectMessage, inspectConversation } from '../../utils/messageInspector';
import { isBotMessage, KNOWN_BOT_INBOX_IDS } from '../../utils/botMessageUtils';
import { ChatMessage } from '../../types/chat';

/**
 * Raw message format from XMTP
 */
export interface XmtpRawMessage {
  id: string;
  content: string | any;
  contentType?: any;
  senderAddress?: string;
  recipientAddress?: string;
  senderInboxId?: string;
  sent: Date | string;
  direction?: 'sent' | 'received';
  status?: 'pending' | 'delivered' | 'error';
  [key: string]: any;
}

/**
 * Options for message streaming
 */
export interface MessageStreamOptions {
  onMessage?: (message: ChatMessage) => void;
  onError?: (error: any) => void;
  onClose?: () => void;
}

/**
 * Options for message processing
 */
export interface MessageProcessingOptions {
  botInboxId?: string;
  ourInboxId?: string;
  ourWalletAddress?: string;
  includeRawMessage?: boolean;
}

/**
 * XMTP Messaging Service
 */
export class XmtpMessagingService {
  private static instance: XmtpMessagingService;
  private activeStreams: Map<string, any> = new Map();
  private logger = console;

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): XmtpMessagingService {
    if (!XmtpMessagingService.instance) {
      XmtpMessagingService.instance = new XmtpMessagingService();
    }
    return XmtpMessagingService.instance;
  }

  /**
   * Load messages from a conversation
   */
  public async loadMessages(
    conversation: any, 
    options: MessageProcessingOptions = {}
  ): Promise<ChatMessage[]> {
    if (!conversation) {
      throw new Error('Cannot load messages: No conversation provided');
    }

    try {
      this.logger.log('Loading messages from conversation:', conversation.id || conversation.topic);
      
      // Inspect the conversation to understand its structure
      inspectConversation(conversation, 'Loading messages from conversation');
      
      // Get messages from the conversation
      this.logger.log('Calling conversation.messages() to load message history');
      const rawMessages = await conversation.messages();
      this.logger.log(`Loaded ${rawMessages.length} messages`);
      
      // Log the first few messages for debugging
      if (rawMessages.length > 0) {
        this.logger.log('First message sample:', rawMessages[0]);
        if (rawMessages.length > 1) {
          this.logger.log('Second message sample:', rawMessages[1]);
        }
      }
      
      // Process the messages - now awaiting since processMessages is async
      return await this.processMessages(rawMessages, options);
    } catch (error) {
      this.logger.error('Error loading messages:', error);
      throw error;
    }
  }

  /**
   * Process raw XMTP messages into a standardized format
   */
  public async processMessages(
    messages: XmtpRawMessage[], 
    options: MessageProcessingOptions = {}
  ): Promise<ChatMessage[]> {
    const processedMessages: ChatMessage[] = [];
    
    for (const msg of messages) {
      try {
        // Inspect the message to understand its structure
        inspectMessage(msg, 'Processing Message');
        
        // Determine if message is from bot
        const isFromBot = this.isMessageFromBot(msg, options);
        this.logger.log(`Message ${msg.id} isFromBot determination: ${isFromBot}`, {
          senderAddress: msg.senderAddress,
          senderInboxId: msg.senderInboxId,
          ourWalletAddress: options.ourWalletAddress,
          ourInboxId: options.ourInboxId,
          botInboxId: options.botInboxId
        });
        
        // Handle content that might be a Promise
        let resolvedContent;
        try {
          if (msg.content instanceof Promise) {
            this.logger.log(`Message ${msg.id} content is a Promise, resolving now...`);
            try {
              resolvedContent = await msg.content;
              this.logger.log(`Message ${msg.id} content resolved:`, resolvedContent);
            } catch (contentError) {
              this.logger.error(`Error resolving content for message ${msg.id}:`, contentError);
              resolvedContent = 'Error: Could not load message content';
            }
          } else {
            resolvedContent = msg.content;
          }
        } catch (contentError) {
          this.logger.error('Error handling content:', contentError);
          resolvedContent = 'Error: Could not load message content';
        }

        // Check if this is an attachment (especially audio)
        const isAttachment = resolvedContent && 
                            typeof resolvedContent === 'object' && 
                            resolvedContent.type && 
                            resolvedContent.type.authorityId === 'xmtp.org' && 
                            resolvedContent.type.typeId === 'attachment';

        // Create a standardized message object
        const processedMessage: ChatMessage = {
          id: msg.id,
          // For attachments, preserve the original structure instead of stringifying
          content: isAttachment ? resolvedContent : 
                  (typeof resolvedContent === 'string' ? resolvedContent : JSON.stringify(resolvedContent)),
          sender: msg.senderAddress || msg.senderInboxId || 'unknown',
          timestamp: msg.sent instanceof Date ? msg.sent : new Date(msg.sentAtNs ? Number(msg.sentAtNs / BigInt(1000000)) : Date.now()),
          isBot: isFromBot,
          ...(options.includeRawMessage ? { rawMessage: msg } : {})
        };
        
        processedMessages.push(processedMessage);
      } catch (error) {
        this.logger.error('Error processing message:', error);
        // Skip this message and continue with the next one
      }
    }
    
    return processedMessages;
  }

  /**
   * Set up a message stream for real-time updates
   */
  public async setupMessageStream(
    conversation: any,
    options: MessageStreamOptions & MessageProcessingOptions = {}
  ): Promise<{ stream: any; cleanup: () => void }> {
    if (!conversation) {
      throw new Error('Cannot set up message stream: No conversation provided');
    }

    try {
      this.logger.log('Setting up message stream for conversation:', conversation.id || conversation.topic);
      
      // Inspect the conversation to understand its structure
      inspectConversation(conversation, 'Setting up stream for conversation');
      
      // Store a reference to the conversation ID for cleanup
      const conversationId = conversation.id || conversation.topic;
      
      // Define the message handler that will process incoming messages
      const onMessage = async (error: Error | null, msg: XmtpRawMessage) => {
        if (error) {
          this.logger.error('Error in message stream:', error);
          if (options.onError) {
            options.onError(error);
          }
          return;
        }
        
        if (!msg) {
          this.logger.warn('Received empty message in stream');
          return;
        }
        
        this.logger.log('🔄 New message received from stream:', msg.id);
        
        try {
          // Inspect the message to understand its structure
          inspectMessage(msg, 'Stream Message');
          
          // Determine if message is from bot
          const isFromBot = this.isMessageFromBot(msg, options);
          this.logger.log(`Stream message ${msg.id} isFromBot determination: ${isFromBot}`, {
            senderAddress: msg.senderAddress,
            senderInboxId: msg.senderInboxId,
            ourWalletAddress: options.ourWalletAddress,
            ourInboxId: options.ourInboxId,
            botInboxId: options.botInboxId
          });
          
          // Handle content that might be a Promise
          let resolvedContent = msg.content;
          if (resolvedContent instanceof Promise) {
            try {
              this.logger.log(`Stream message ${msg.id} content is a Promise, resolving...`);
              resolvedContent = await resolvedContent;
              this.logger.log(`Stream message ${msg.id} content resolved:`, 
                typeof resolvedContent === 'string' ? resolvedContent : 'non-string content');
            } catch (contentError) {
              this.logger.error('Error resolving stream message content:', contentError);
              resolvedContent = 'Error: Could not load message content';
            }
          }

          // Check if this is an attachment (especially audio)
          const isAttachment = resolvedContent && 
                              typeof resolvedContent === 'object' && 
                              resolvedContent.type && 
                              resolvedContent.type.authorityId === 'xmtp.org' && 
                              resolvedContent.type.typeId === 'attachment';
          
          if (isAttachment) {
            this.logger.log(`Message ${msg.id} is an attachment`);
          }

          // Create a standardized message object
          const processedMessage: ChatMessage = {
            id: msg.id,
            // For attachments, preserve the original structure instead of stringifying
            content: isAttachment ? resolvedContent : 
                    (typeof resolvedContent === 'string' ? resolvedContent : JSON.stringify(resolvedContent)),
            sender: msg.senderAddress || msg.senderInboxId || 'unknown',
            timestamp: msg.sent instanceof Date ? msg.sent : new Date(msg.sentAtNs ? Number(msg.sentAtNs / BigInt(1000000)) : Date.now()),
            isBot: isFromBot,
            senderInboxId: msg.senderInboxId, // Add this for debugging
            ...(options.includeRawMessage ? { rawMessage: msg } : {})
          };
          
          this.logger.log(`✅ Processed message ${msg.id} ready for UI:`, {
            id: processedMessage.id,
            sender: processedMessage.sender,
            isBot: processedMessage.isBot,
            contentType: typeof processedMessage.content,
            timestamp: processedMessage.timestamp
          });
          
          // Call the onMessage callback if provided
          if (options.onMessage) {
            this.logger.log(`📤 Calling onMessage callback for message ${msg.id}`);
            options.onMessage(processedMessage);
          } else {
            this.logger.warn(`⚠️ No onMessage callback provided for message ${msg.id}`);
          }
        } catch (error) {
          this.logger.error('Error processing stream message:', error);
        }
      };
      
      // Set up the stream using the conversation.stream method
      this.logger.log(`Starting stream for conversation ${conversationId}`);
      let stream;
      try {
        stream = conversation.stream(onMessage);
        this.logger.log(`Stream created for conversation ${conversationId}`);
      } catch (error) {
        this.logger.error(`Error creating stream for conversation ${conversationId}:`, error);
        throw error;
      }
      
      // Store the stream reference in case we need to close it later
      if (conversationId) {
        this.activeStreams.set(conversationId, stream);
        this.logger.log(`Stream stored in activeStreams map with key ${conversationId}`);
      }
      
      // Define the cleanup function
      const cleanup = () => {
        try {
          this.logger.log(`Cleaning up stream for conversation ${conversationId}`);
          
          // Close the stream
          if (stream && typeof stream.close === 'function') {
            stream.close();
            this.logger.log(`Stream closed for conversation ${conversationId}`);
          }
          
          // Remove from active streams
          if (conversationId) {
            this.activeStreams.delete(conversationId);
            this.logger.log(`Stream removed from activeStreams map for key ${conversationId}`);
          }
          
          // Call the onClose callback if provided
          if (options.onClose) {
            this.logger.log(`Calling onClose callback for conversation ${conversationId}`);
            options.onClose();
          }
        } catch (error) {
          this.logger.error(`Error cleaning up stream for conversation ${conversationId}:`, error);
        }
      };
      
      this.logger.log(`Message stream setup complete for conversation ${conversationId}`);
      return { stream, cleanup };
    } catch (error) {
      this.logger.error('Error setting up message stream:', error);
      throw error;
    }
  }

  /**
   * Send a message to a conversation
   */
  public async sendMessage(
    conversation: any,
    messageContent: string | object
  ): Promise<any> {
    if (!conversation) {
      throw new Error('Cannot send message: No conversation provided');
    }

    try {
      this.logger.log('Sending message to conversation:', conversation.id || conversation.topic);
      inspectConversation(conversation, 'Sending to Conversation');
      
      // Log message content
      this.logger.log('Message content to send:', 
        typeof messageContent === 'string' 
          ? messageContent.substring(0, 100) + (messageContent.length > 100 ? '...' : '') 
          : 'object content');
      
      // Send the message
      const sentMessage = await conversation.send(messageContent);
      this.logger.log('Message sent successfully:', {
        id: sentMessage.id,
        contentType: sentMessage.contentType?.toString() || 'unknown',
        senderAddress: sentMessage.senderAddress,
        recipientAddress: sentMessage.recipientAddress,
        sent: sentMessage.sent
      });
      
      // Inspect the sent message
      inspectMessage(sentMessage, 'Sent Message');
      
      return sentMessage;
    } catch (error) {
      this.logger.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Check if a message is from a bot
   */
  public isMessageFromBot(
    message: XmtpRawMessage,
    options: {
      botInboxId?: string;
      ourInboxId?: string;
      ourWalletAddress?: string;
    } = {}
  ): boolean {
    try {
      this.logger.log('Checking if message is from bot:', {
        messageId: message.id,
        senderAddress: message.senderAddress,
        senderInboxId: message.senderInboxId,
        ourWalletAddress: options.ourWalletAddress,
        botInboxId: options.botInboxId || KNOWN_BOT_INBOX_IDS[0]
      });
      
      // First, check if the message is from a known bot inbox ID
      if (message.senderInboxId && 
          (KNOWN_BOT_INBOX_IDS.includes(message.senderInboxId) || 
           (options.botInboxId && message.senderInboxId === options.botInboxId))) {
        this.logger.log(`Message ${message.id} is from bot (matched inbox ID)`);
        return true;
      }
      
      // Check if the message is from the bot's address
      if (message.senderAddress && options.botInboxId && 
          message.senderAddress.toLowerCase() === options.botInboxId.toLowerCase()) {
        this.logger.log(`Message ${message.id} is from bot (matched address)`);
        return true;
      }
      
      // CRITICAL FIX: Check if the message is from the user by comparing with ourWalletAddress
      // If it's from the user, it's NOT a bot message
      if (options.ourWalletAddress && message.senderAddress) {
        const isFromUser = message.senderAddress.toLowerCase() === options.ourWalletAddress.toLowerCase();
        if (isFromUser) {
          this.logger.log(`Message ${message.id} is NOT from bot (from user wallet address)`);
          return false;
        }
      }
      
      // Check if the message is from the user's inbox
      if (options.ourInboxId && message.senderInboxId) {
        const isFromUserInbox = message.senderInboxId === options.ourInboxId;
        if (isFromUserInbox) {
          this.logger.log(`Message ${message.id} is NOT from bot (from user inbox)`);
          return false;
        }
      }
      
      // If we have explicit direction information, use that
      if (message.direction === 'received') {
        this.logger.log(`Message ${message.id} is from bot (direction is 'received')`);
        return true;
      }
      
      // If we have an explicit isBot flag, use that
      if (message.isBot === true) {
        this.logger.log(`Message ${message.id} is from bot (has isBot flag)`);
        return true;
      }
      
      // If we know the bot's inbox ID and the user's inbox ID, and the message is not from the user,
      // then it's likely from the bot
      if (options.botInboxId && options.ourInboxId && message.senderInboxId !== options.ourInboxId) {
        this.logger.log(`Message ${message.id} is from bot (not from user inbox, likely bot)`);
        return true;
      }
      
      // If we know the bot's address and the user's address, and the message is not from the user,
      // then it's likely from the bot
      if (options.botInboxId && options.ourWalletAddress && 
          message.senderAddress && message.senderAddress.toLowerCase() !== options.ourWalletAddress.toLowerCase()) {
        this.logger.log(`Message ${message.id} is from bot (not from user address, likely bot)`);
        return true;
      }
      
      // Default to false - assume it's from the user if we can't determine
      this.logger.log(`Message ${message.id} is NOT from bot (default)`);
      return false;
    } catch (error) {
      this.logger.error('Error checking if message is from bot:', error);
      return false;
    }
  }

  /**
   * Clean up all active message streams
   */
  public cleanupAllStreams(): void {
    this.logger.log(`Cleaning up ${this.activeStreams.size} active streams`);
    
    for (const [conversationId, stream] of this.activeStreams.entries()) {
      try {
        this.logger.log(`Cleaning up stream for conversation ${conversationId}`);
        
        // Unsubscribe from the stream
        if (stream && typeof stream.unsubscribe === 'function') {
          this.logger.log(`Calling stream.unsubscribe() for conversation ${conversationId}`);
          stream.unsubscribe();
        } else {
          this.logger.warn(`Stream for conversation ${conversationId} does not have an unsubscribe method:`, stream);
        }
        
        this.logger.log(`Stream for conversation ${conversationId} cleaned up successfully`);
      } catch (error) {
        this.logger.error(`Error cleaning up stream for conversation ${conversationId}:`, error);
      }
    }
    
    // Clear the map
    this.activeStreams.clear();
    this.logger.log('All streams cleaned up');
  }
}

// Export a singleton instance
export const xmtpMessagingService = XmtpMessagingService.getInstance(); 