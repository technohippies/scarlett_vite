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
      this.logger.log('Setting up message stream...');
      
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
        
        this.logger.log('New message received from stream:', msg);
        
        try {
          // Inspect the message to understand its structure
          inspectMessage(msg, 'Stream Message');
          
          // Determine if message is from bot
          const isFromBot = this.isMessageFromBot(msg, options);
          
          // Handle content that might be a Promise
          let resolvedContent = msg.content;
          if (resolvedContent instanceof Promise) {
            try {
              this.logger.log(`Stream message ${msg.id} content is a Promise, resolving...`);
              resolvedContent = await resolvedContent;
              this.logger.log(`Stream message ${msg.id} content resolved:`, resolvedContent);
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
          
          // Call the onMessage callback if provided
          if (options.onMessage) {
            options.onMessage(processedMessage);
          }
        } catch (error) {
          this.logger.error('Error processing stream message:', error);
        }
      };
      
      // Set up the stream using the conversation.stream method
      const stream = conversation.stream(onMessage);
      
      // Store the stream reference in case we need to close it later
      if (conversationId) {
        this.activeStreams.set(conversationId, stream);
      }
      
      // Define the cleanup function
      const cleanup = () => {
        try {
          this.logger.log('Cleaning up message stream...');
          
          // Remove the stream from our active streams
          if (conversationId) {
            this.activeStreams.delete(conversationId);
          }
          
          // Unsubscribe from the stream
          if (stream && typeof stream.unsubscribe === 'function') {
            this.logger.log('Calling stream.unsubscribe()');
            stream.unsubscribe();
          } else {
            this.logger.warn('Stream does not have an unsubscribe method:', stream);
          }
          
          this.logger.log('Message stream cleaned up successfully');
        } catch (error) {
          this.logger.error('Error cleaning up message stream:', error);
        }
      };

      return { stream, cleanup };
    } catch (streamError) {
      this.logger.error('Error setting up message stream:', streamError);
      throw streamError;
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
      
      // Send the message
      const sentMessage = await conversation.send(messageContent);
      this.logger.log('Message sent successfully');
      
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
        senderInboxId: (message as any).senderInboxId,
        ourWalletAddress: options.ourWalletAddress,
        botInboxId: options.botInboxId || KNOWN_BOT_INBOX_IDS[0]
      });
      
      // Use the utility function to determine if the message is from a bot
      const isBot = isBotMessage(
        message, 
        options.ourWalletAddress, 
        options.botInboxId || KNOWN_BOT_INBOX_IDS[0]
      );
      
      this.logger.log(`Message ${message.id} isFromBot: ${isBot}`);
      return isBot;
    } catch (error) {
      this.logger.error('Error determining if message is from bot:', error);
      // Default to false if we can't determine
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