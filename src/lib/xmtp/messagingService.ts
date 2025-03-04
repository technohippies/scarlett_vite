/**
 * XMTP Messaging Service
 * 
 * This service provides unified handling of XMTP messaging functionality,
 * including bot detection, message streaming, and message sending.
 * It's designed to be used by the ChatPage component.
 */

import { inspectMessage, inspectConversation } from '../../utils/messageInspector';
import { KNOWN_BOT_INBOX_IDS } from '../../utils/botMessageUtils';
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
      throw new Error('No conversation provided to setupMessageStream');
    }
    
    try {
      // Check if conversation has the stream method (new API) or streamMessages method (old API)
      if (typeof conversation.stream === 'function') {
        return this.setupStreamWithNewApi(conversation, options);
      } else if (typeof conversation.streamMessages === 'function') {
        return this.setupStreamWithOldApi(conversation, options);
      } else {
        this.logger.error('Conversation object does not have stream or streamMessages method');
        throw new Error('Invalid conversation object: missing stream/streamMessages method');
      }
    } catch (error) {
      this.logger.error('Error setting up message stream:', error);
      
      // If there's an onError callback, call it
      if (options.onError) {
        try {
          options.onError(error);
        } catch (callbackError) {
          this.logger.error('Error in onError callback:', callbackError);
        }
      }
      
      // Return a dummy stream and cleanup function that will trigger reconnection
      return {
        stream: null,
        cleanup: () => {
          if (options.onClose) {
            options.onClose();
          }
        }
      };
    }
  }

  /**
   * Set up a message stream using the new API (conversation.stream())
   */
  private async setupStreamWithNewApi(
    conversation: any,
    options: MessageStreamOptions & MessageProcessingOptions = {}
  ): Promise<{ stream: any; cleanup: () => void }> {
    let stream: any = null;
    const streamKey = `${conversation.topic || conversation.id}-${Date.now()}`;
    
    try {
      this.logger.log('Creating stream with conversation.stream() method...');
      
      // XMTP SDK v7+ uses a different stream pattern
      // First check if we're dealing with the newer SDK that returns an AsyncGenerator
      if (conversation.stream && !conversation.stream.length) {
        this.logger.log('Detected newer XMTP SDK with AsyncGenerator stream');
        
        // Create a stream processor function that will run in the background
        const processStream = async () => {
          try {
            // Get the stream (AsyncGenerator)
            const messageStream = conversation.stream();
            
            // Store reference for cleanup
            stream = messageStream;
            
            // Process messages as they come in
            this.logger.log('Starting to process message stream (AsyncGenerator)');
            for await (const msg of messageStream) {
              if (!msg) {
                this.logger.warn('Received empty message in stream');
                continue;
              }
              
              this.logger.log('New message received from AsyncGenerator stream:', msg.id);
              
              try {
                // Process the message
                await this.processStreamMessage(msg, options);
              } catch (processingError) {
                this.logger.error(`Error processing stream message ${msg?.id || 'unknown'}:`, processingError);
                if (options.onError) {
                  try {
                    options.onError(processingError);
                  } catch (callbackError) {
                    this.logger.error('Error in onError callback:', callbackError);
                  }
                }
              }
            }
            
            this.logger.log('Message stream (AsyncGenerator) ended');
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback:', closeError);
              }
            }
          } catch (streamError) {
            this.logger.error('Error processing message stream (AsyncGenerator):', streamError);
            if (options.onError) {
              try {
                options.onError(streamError);
              } catch (callbackError) {
                this.logger.error('Error in onError callback:', callbackError);
              }
            }
            
            // If the stream errors, call onClose to trigger reconnection
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback after stream error:', closeError);
              }
            }
          }
        };
        
        // Start processing the stream in the background
        processStream().catch(error => {
          this.logger.error('Unhandled error in stream processor:', error);
        });
        
        // Store the stream reference for cleanup
        this.activeStreams.set(streamKey, stream);
        
        this.logger.log(`Message stream (AsyncGenerator) created successfully for ${conversation.topic || conversation.id}, stored with key ${streamKey}`);
        
        // Add a periodic health check for the stream
        const healthCheckInterval = setInterval(() => {
          this.logger.log(`Health check for stream ${streamKey}`);
          if (!this.activeStreams.has(streamKey)) {
            this.logger.warn(`Stream ${streamKey} no longer in active streams map, clearing health check`);
            clearInterval(healthCheckInterval);
          }
        }, 30000); // Check every 30 seconds
        
        // Define the cleanup function
        const cleanup = () => {
          try {
            this.logger.log(`Cleaning up message stream for ${conversation.topic || conversation.id}`);
            
            // Clear the health check interval
            clearInterval(healthCheckInterval);
            
            if (stream && typeof stream.return === 'function') {
              try {
                stream.return();
                this.logger.log(`Stream closed for ${conversation.topic || conversation.id}`);
              } catch (closeError) {
                this.logger.error('Error closing stream:', closeError);
              }
            }
            
            // Remove from active streams
            this.activeStreams.delete(streamKey);
            this.logger.log(`Removed stream with key ${streamKey} from active streams`);
            
            // Call the onClose callback if provided
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback:', closeError);
              }
            }
          } catch (cleanupError) {
            this.logger.error('Error cleaning up message stream:', cleanupError);
            // Still call onClose even if there was an error
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback during error handling:', closeError);
              }
            }
          }
        };
        
        return { stream, cleanup };
      } else {
        // Older XMTP SDK with callback-based stream
        this.logger.log('Using callback-based stream API');
        
        // Create the stream with callback handler
        stream = conversation.stream(async (error: Error | null, msg: XmtpRawMessage) => {
          if (error) {
            this.logger.error('Error in message stream:', error);
            if (options.onError) {
              try {
                options.onError(error);
              } catch (callbackError) {
                this.logger.error('Error in onError callback:', callbackError);
              }
            }
            return;
          }
          
          if (!msg) {
            this.logger.warn('Received empty message in stream');
            return;
          }
          
          this.logger.log('🔄 New message received from stream:', msg.id);
          
          try {
            // Process the message
            await this.processStreamMessage(msg, options);
          } catch (processingError) {
            this.logger.error(`Error processing stream message ${msg?.id || 'unknown'}:`, processingError);
            if (options.onError) {
              try {
                options.onError(processingError);
              } catch (callbackError) {
                this.logger.error('Error in onError callback:', callbackError);
              }
            }
          }
        });
        
        // Store the stream reference for cleanup
        this.activeStreams.set(streamKey, stream);
        
        this.logger.log(`Message stream created successfully for ${conversation.topic || conversation.id}, stored with key ${streamKey}`);
        
        // Add a periodic health check for the stream
        const healthCheckInterval = setInterval(() => {
          this.logger.log(`Health check for stream ${streamKey}`);
          if (!this.activeStreams.has(streamKey)) {
            this.logger.warn(`Stream ${streamKey} no longer in active streams map, clearing health check`);
            clearInterval(healthCheckInterval);
          }
        }, 30000); // Check every 30 seconds
        
        // Define the cleanup function
        const cleanup = () => {
          try {
            this.logger.log(`Cleaning up message stream for ${conversation.topic || conversation.id}`);
            
            // Clear the health check interval
            clearInterval(healthCheckInterval);
            
            if (stream && typeof stream.unsubscribe === 'function') {
              try {
                stream.unsubscribe();
                this.logger.log(`Stream unsubscribed for ${conversation.topic || conversation.id}`);
              } catch (unsubError) {
                this.logger.error('Error unsubscribing from stream:', unsubError);
              }
            }
            
            // Remove from active streams
            this.activeStreams.delete(streamKey);
            this.logger.log(`Removed stream with key ${streamKey} from active streams`);
            
            // Call the onClose callback if provided
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback:', closeError);
              }
            }
          } catch (cleanupError) {
            this.logger.error('Error cleaning up message stream:', cleanupError);
            // Still call onClose even if there was an error
            if (options.onClose) {
              try {
                options.onClose();
              } catch (closeError) {
                this.logger.error('Error in onClose callback during error handling:', closeError);
              }
            }
          }
        };
        
        return { stream, cleanup };
      }
    } catch (error) {
      this.logger.error('Error setting up message stream with new API:', error);
      
      // Clean up any partially created stream
      if (stream) {
        try {
          if (typeof stream.unsubscribe === 'function') {
            stream.unsubscribe();
          } else if (typeof stream.return === 'function') {
            stream.return();
          }
          this.activeStreams.delete(streamKey);
        } catch (cleanupError) {
          this.logger.error('Error cleaning up partial stream:', cleanupError);
        }
      }
      
      // If there's an onError callback, call it
      if (options.onError) {
        try {
          options.onError(error);
        } catch (callbackError) {
          this.logger.error('Error in onError callback during setup error:', callbackError);
        }
      }
      
      // Return a dummy stream and cleanup function that will trigger reconnection
      return {
        stream: null,
        cleanup: () => {
          this.logger.log('Dummy cleanup called for failed stream');
          if (options.onClose) {
            try {
              options.onClose();
            } catch (closeError) {
              this.logger.error('Error in onClose callback for dummy cleanup:', closeError);
            }
          }
        }
      };
    }
  }

  /**
   * Set up a message stream using the old API (conversation.streamMessages())
   */
  private async setupStreamWithOldApi(
    conversation: any,
    options: MessageStreamOptions & MessageProcessingOptions = {}
  ): Promise<{ stream: any; cleanup: () => void }> {
    let stream: any = null;
    const streamKey = `${conversation.topic || conversation.id}-${Date.now()}`;
    
    try {
      this.logger.log('Calling conversation.streamMessages() to create stream...');
      stream = await conversation.streamMessages();
      
      // Verify the stream was created successfully
      if (!stream) {
        this.logger.error('Failed to create message stream - stream is null or undefined');
        throw new Error('Failed to create message stream');
      }
      
      this.logger.log('Stream created successfully:', stream);
      
      // Store the stream reference for cleanup
      this.activeStreams.set(streamKey, stream);
      
      this.logger.log(`Message stream created successfully for ${conversation.topic || conversation.id}, stored with key ${streamKey}`);
      
      // Add a periodic health check for the stream
      const healthCheckInterval = setInterval(() => {
        this.logger.log(`Health check for stream ${streamKey}`);
        if (!this.activeStreams.has(streamKey)) {
          this.logger.warn(`Stream ${streamKey} no longer in active streams map, clearing health check`);
          clearInterval(healthCheckInterval);
        }
      }, 30000); // Check every 30 seconds
      
      // Define the message handler
      const onMessage = async (msg: XmtpRawMessage) => {
        if (!msg) {
          this.logger.warn('Received empty message in stream');
          return;
        }
        
        this.logger.log('🔄 New message received from stream:', msg.id);
        
        try {
          // Process the message
          await this.processStreamMessage(msg, options);
        } catch (processingError) {
          this.logger.error(`Error processing stream message ${msg?.id || 'unknown'}:`, processingError);
          if (options.onError) {
            try {
              options.onError(processingError);
            } catch (callbackError) {
              this.logger.error('Error in onError callback:', callbackError);
            }
          }
        }
      };
      
      // Set up the stream with the message handler
      this.logger.log('Attaching message handler to stream...');
      stream.on('message', onMessage);
      
      // Add an error handler to the stream
      stream.on('error', (error: Error) => {
        this.logger.error(`Error in message stream for ${conversation.topic || conversation.id}:`, error);
        if (options.onError) {
          try {
            options.onError(error);
          } catch (callbackError) {
            this.logger.error('Error in onError callback:', callbackError);
          }
        }
      });
      
      // Add a close handler to the stream
      stream.on('close', () => {
        this.logger.log(`Stream closed for ${conversation.topic || conversation.id}`);
        
        // Clear the health check interval
        clearInterval(healthCheckInterval);
        
        // Remove from active streams
        this.activeStreams.delete(streamKey);
        
        if (options.onClose) {
          try {
            options.onClose();
          } catch (closeError) {
            this.logger.error('Error in onClose callback:', closeError);
          }
        }
      });
      
      // Define the cleanup function
      const cleanup = () => {
        try {
          this.logger.log(`Cleaning up message stream for ${conversation.topic || conversation.id}`);
          
          // Clear the health check interval
          clearInterval(healthCheckInterval);
          
          if (stream) {
            try {
              stream.removeAllListeners();
              this.logger.log(`Removed all listeners from stream for ${conversation.topic || conversation.id}`);
            } catch (removeError) {
              this.logger.error('Error removing listeners from stream:', removeError);
            }
            
            try {
              stream.close();
              this.logger.log(`Stream closed for ${conversation.topic || conversation.id}`);
            } catch (closeError) {
              this.logger.error('Error closing stream:', closeError);
            }
          }
          
          // Remove from active streams
          this.activeStreams.delete(streamKey);
          this.logger.log(`Removed stream with key ${streamKey} from active streams`);
          
          // Call the onClose callback if provided
          if (options.onClose) {
            try {
              options.onClose();
            } catch (closeError) {
              this.logger.error('Error in onClose callback:', closeError);
            }
          }
        } catch (cleanupError) {
          this.logger.error('Error cleaning up message stream:', cleanupError);
          // Still call onClose even if there was an error
          if (options.onClose) {
            try {
              options.onClose();
            } catch (closeError) {
              this.logger.error('Error in onClose callback during error handling:', closeError);
            }
          }
        }
      };
      
      return { stream, cleanup };
    } catch (error) {
      this.logger.error('Error setting up message stream with old API:', error);
      
      // Clean up any partially created stream
      if (stream) {
        try {
          stream.removeAllListeners();
          stream.close();
          this.activeStreams.delete(streamKey);
        } catch (cleanupError) {
          this.logger.error('Error cleaning up partial stream:', cleanupError);
        }
      }
      
      // If there's an onError callback, call it
      if (options.onError) {
        try {
          options.onError(error);
        } catch (callbackError) {
          this.logger.error('Error in onError callback during setup error:', callbackError);
        }
      }
      
      // Return a dummy stream and cleanup function that will trigger reconnection
      return {
        stream: null,
        cleanup: () => {
          this.logger.log('Dummy cleanup called for failed stream');
          if (options.onClose) {
            try {
              options.onClose();
            } catch (closeError) {
              this.logger.error('Error in onClose callback for dummy cleanup:', closeError);
            }
          }
        }
      };
    }
  }

  /**
   * Process a message received from the stream
   */
  private async processStreamMessage(
    msg: XmtpRawMessage,
    options: MessageStreamOptions & MessageProcessingOptions = {}
  ): Promise<void> {
    try {
      // Determine if message is from bot
      const isFromBot = this.isMessageFromBot(msg, options);
      
      // Handle content that might be a Promise
      let resolvedContent = msg.content;
      if (resolvedContent instanceof Promise) {
        try {
          resolvedContent = await resolvedContent;
        } catch (contentError) {
          // Don't log content errors to reduce spam
          resolvedContent = 'Error: Could not load message content';
        }
      }

      // Check if this is an attachment (especially audio)
      let isAttachment = false;
      try {
        // Check for XMTP attachment format
        const hasXmtpAttachmentType = resolvedContent && 
                      typeof resolvedContent === 'object' && 
                      resolvedContent.type && 
                      resolvedContent.type.authorityId === 'xmtp.org' && 
                      resolvedContent.type.typeId === 'attachment';
        
        // Check for contentType format (alternative format)
        const hasContentTypeAttachment = resolvedContent && 
                      typeof resolvedContent === 'object' && 
                      msg.contentType && 
                      typeof msg.contentType === 'object' && 
                      msg.contentType.authorityId === 'xmtp.org' && 
                      msg.contentType.typeId === 'attachment';
        
        isAttachment = hasXmtpAttachmentType || hasContentTypeAttachment;
      } catch (attachmentError) {
        // Don't log attachment errors to reduce spam
      }

      // Convert timestamp to Date object if it's a string
      const timestamp = typeof msg.sent === 'string' ? new Date(msg.sent) : msg.sent;

      // Process the message into our standard format
      const processedMessage: ChatMessage = {
        id: msg.id,
        content: resolvedContent,
        timestamp: timestamp,
        sender: msg.senderAddress || msg.senderInboxId || 'unknown',
        isBot: isFromBot,
        senderInboxId: msg.senderInboxId
      };

      // Add the raw message if requested
      if (options.includeRawMessage) {
        (processedMessage as any).rawMessage = msg;
      }

      // Call the onMessage callback if provided
      if (options.onMessage) {
        try {
          options.onMessage(processedMessage);
        } catch (callbackError) {
          // Don't log callback errors to reduce spam
        }
      }
    } catch (error) {
      // Only log critical errors, not common ones
      const errorString = String(error);
      const isCommonError = errorString.includes('Worker') || 
                           errorString.includes('error decoding response body') ||
                           errorString.includes('expected `,` or `}`');
      
      if (!isCommonError) {
        this.logger.error('Error processing stream message:', error);
      }
      
      // Re-throw the error to be handled by the caller
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
      throw new Error('No conversation provided to sendMessage');
    }
    
    try {
      this.logger.log(`Sending message to conversation: ${conversation.topic || conversation.id}`);
      
      // Log the message content for debugging
      if (typeof messageContent === 'string') {
        this.logger.log(`Message content (string, first 100 chars): ${messageContent.substring(0, 100)}${messageContent.length > 100 ? '...' : ''}`);
      } else {
        // Check if it's an attachment
        const isAttachment = messageContent && 
                            typeof messageContent === 'object' && 
                            (messageContent as any).contentType && 
                            (messageContent as any).contentType.authorityId === 'xmtp.org' && 
                            (messageContent as any).contentType.typeId === 'attachment';
                            
        if (isAttachment) {
          this.logger.log(`Sending attachment: ${(messageContent as any).filename || 'unnamed attachment'}`);
        } else {
          this.logger.log('Sending object message:', messageContent);
        }
      }
      
      // Inspect the conversation before sending
      inspectConversation(conversation, 'Before sending message');
      
      // Safely prepare the message content
      let preparedContent = messageContent;
      
      // If it's an object but not an attachment with special handling, ensure it can be stringified
      if (typeof messageContent === 'object' && 
          !((messageContent as any).contentType && 
            (messageContent as any).contentType.authorityId === 'xmtp.org')) {
        try {
          // Test if it can be stringified
          JSON.stringify(messageContent);
        } catch (stringifyError) {
          this.logger.error('Error stringifying message content:', stringifyError);
          
          // Create a safe copy that can be stringified
          try {
            const safeReplacer = (key: string, value: any) => {
              if (value instanceof Uint8Array) {
                return `[Binary data (${value.length} bytes)]`;
              }
              if (typeof value === 'bigint') {
                return value.toString();
              }
              return value;
            };
            
            // Create a safe version that can be stringified
            const safeContent = JSON.parse(JSON.stringify(messageContent, safeReplacer));
            preparedContent = safeContent;
            this.logger.log('Created safe version of message content that can be stringified');
          } catch (safeError: any) {
            this.logger.error('Error creating safe message content:', safeError);
            throw new Error(`Cannot send message: content cannot be properly serialized (${safeError.message})`);
          }
        }
      }
      
      // Verify the conversation is valid before sending
      if (!conversation.send || typeof conversation.send !== 'function') {
        this.logger.error('Invalid conversation object:', conversation);
        throw new Error('Cannot send message: conversation object is invalid or missing send method');
      }
      
      // Send the message with a timeout to prevent hanging
      this.logger.log('🔄 Calling conversation.send() to send message...');
      
      // Create a promise that will resolve with the sent message or reject after a timeout
      const sendWithTimeout = async (timeout = 10000) => {
        return new Promise<any>(async (resolve, reject) => {
          // Set up a timeout to reject the promise if it takes too long
          const timeoutId = setTimeout(() => {
            this.logger.warn(`⏱️ Send operation timed out after ${timeout}ms`);
            // Resolve with a synthetic message instead of rejecting to allow the UI to continue
            const syntheticId = `timeout-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
            resolve({ 
              id: syntheticId, 
              content: preparedContent,
              synthetic: true,
              timedOut: true
            });
          }, timeout);
          
          try {
            // Attempt to send the message
            const result = await conversation.send(preparedContent);
            // Clear the timeout since we got a response
            clearTimeout(timeoutId);
            // Resolve with the result
            resolve(result);
          } catch (error) {
            // Clear the timeout since we got an error
            clearTimeout(timeoutId);
            // Reject with the error
            reject(error);
          }
        });
      };
      
      // Send with a 10-second timeout
      const sentMessage = await sendWithTimeout(10000);
      
      // Log what we got back
      this.logger.log(`✅ Message sent successfully:`, {
        id: (sentMessage as any)?.id,
        contentType: (sentMessage as any)?.contentType?.toString() || 
                    ((sentMessage as any)?.content ? typeof (sentMessage as any).content : 'unknown'),
        senderAddress: (sentMessage as any)?.senderAddress,
        recipientAddress: (sentMessage as any)?.recipientAddress,
        sent: (sentMessage as any)?.sent,
        timedOut: (sentMessage as any)?.timedOut || false
      });
      
      // Inspect the sent message if it exists
      if (sentMessage && !(sentMessage as any)?.timedOut) {
        inspectMessage(sentMessage, 'Sent message');
      } else if ((sentMessage as any)?.timedOut) {
        this.logger.log('Send operation timed out, but continuing with synthetic message');
      } else {
        this.logger.log('No message object returned, but send operation completed');
      }
      
      // Some XMTP implementations don't return a message object but still succeed
      // So we'll check if we got a string back (which could be a message ID)
      if (typeof sentMessage === 'string') {
        this.logger.log(`📨 Message sent successfully with ID: ${sentMessage}`);
        return { id: sentMessage, content: messageContent };
      }
      
      // If we got something that looks like a message ID in any form, consider it successful
      if (sentMessage && typeof sentMessage === 'object') {
        // If it has an ID property, it's probably a valid message
        if ((sentMessage as any).id) {
          this.logger.log(`📨 Message ${(sentMessage as any).id} sent successfully and should appear in stream`);
          return sentMessage;
        }
        
        // Check if any property looks like a message ID (64 character hex string)
        for (const key in sentMessage) {
          const value = (sentMessage as any)[key];
          if (typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value)) {
            this.logger.log(`📨 Found potential message ID in response: ${value}`);
            return { ...sentMessage, id: value, content: messageContent };
          }
        }
        
        // If the object itself is an array or has array-like properties that look like a hex string
        if (Array.isArray(sentMessage) || (sentMessage as any).length) {
          const hexChars = '0123456789abcdef';
          let isHexString = true;
          let hexString = '';
          
          // Try to convert array-like object to hex string
          for (let i = 0; i < (sentMessage as any).length; i++) {
            const char = String((sentMessage as any)[i]).toLowerCase();
            if (hexChars.includes(char)) {
              hexString += char;
            } else {
              isHexString = false;
              break;
            }
          }
          
          if (isHexString && hexString.length === 64) {
            this.logger.log(`📨 Converted array-like response to message ID: ${hexString}`);
            return { id: hexString, content: messageContent };
          }
        }
      }
      
      // If we got here, we don't have a clear message ID, but the send didn't throw an error
      // So we'll create a synthetic message ID and consider it successful
      const syntheticId = `synthetic-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
      this.logger.log(`📨 Message sent but no clear ID returned. Using synthetic ID: ${syntheticId}`);
      return { 
        id: syntheticId, 
        content: messageContent,
        synthetic: true,
        originalResponse: sentMessage
      };
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