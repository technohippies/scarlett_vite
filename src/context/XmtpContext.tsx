import React, { createContext, useContext, useState, ReactNode, useRef, useCallback, useEffect } from 'react';
// Import directly from @xmtp/browser-sdk
import { Client } from '@xmtp/browser-sdk';

// Import ethers for wallet connection
import { ethers } from 'ethers';
// Import constants
import { SCARLETT_BOT_ADDRESS } from '../lib/constants';
// Import our attachment helper
import { loadXmtpAttachmentModule } from '../utils/xmtpAttachmentHelper';

// Define our own types to avoid conflicts
interface Conversation {
  id: string;
  peerAddress: string;
  updatedAt: Date;
  isBot: boolean;
  messages: any[];
}

// Define the context type
interface XmtpContextType {
  client: Client | null;
  conversations: Conversation[];
  isConnected: boolean;
  isConnecting: boolean;
  connectionError: Error | null;
  connectXmtp: (signer: any) => Promise<void>;
  connectWithWagmi: () => Promise<boolean>;
  connectWithEthers: () => Promise<boolean>;
  disconnectXmtp: () => void;
  resetXmtpConnection: () => void;
  sendMessage: (conversationTopic: string, message: string) => Promise<any>;
  loadConversations: () => Promise<void>;
  canMessage: (address: string) => Promise<boolean>;
  getOrCreateConversation: (peerAddress: string) => Promise<any>;
  createBotConversation: () => Promise<any>;
  // Add attachment module properties
  attachmentModule: {
    ContentTypeAttachment: any;
    AttachmentCodec: any;
    RemoteAttachmentCodec: any;
    ContentTypeRemoteAttachment: any;
    isLoaded: boolean;
  };
}

// Create context
const XmtpContext = createContext<XmtpContextType | null>(null);

// Hook to use XMTP context
export const useXmtp = () => {
  const context = useContext(XmtpContext);
  console.log('useXmtp called, context available:', !!context);
  if (!context) {
    console.warn('useXmtp must be used within an XmtpProvider');
    return null;
  }
  return context;
};

// Cache for signatures to prevent repeated signing
const signatureCache = new Map<string, string>();

// Define a logger to standardize logging format and enable/disable logs
const logger = {
  debug: (message: string, data?: any) => {
    console.log(`[XMTP Debug] ${message}`, data || '');
  },
  info: (message: string, data?: any) => {
    console.log(`[XMTP Info] ${message}`, data || '');
  },
  warn: (message: string, data?: any) => {
    console.warn(`[XMTP Warning] ${message}`, data || '');
  },
  error: (message: string, data?: any) => {
    console.error(`[XMTP Error] ${message}`, data || '');
  },
  signature: (message: string, data?: any) => {
    // Special logger for signature-related events
    console.log(`[XMTP Signature] ${message}`, data || '');
  }
};

// Helper function to log detailed error information
const logDetailedError = (error: any, context: string) => {
  logger.error(`${context} Error Details:`, {
    message: error.message,
    name: error.name,
    stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack trace
    cause: error.cause ? {
      message: error.cause.message,
      name: error.cause.name
    } : 'No cause'
  });
  
  // Special handling for signature validation errors
  if (error.message && error.message.includes('Signature validation failed')) {
    logger.error('Signature validation failed. This could be due to:');
    logger.error('1. The wallet is a smart contract wallet (SCW) but not identified as such');
    logger.error('2. The signature format is not compatible with XMTP verification');
    logger.error('3. The wallet is using a non-standard signing method');
  }
};

interface XmtpProviderProps {
  children: ReactNode;
}

// Create a custom signer type for XMTP
interface CustomXmtpSigner {
  walletType: "EOA" | "Contract";
  getAddress: () => Promise<string>;
  signMessage: (message: string) => Promise<Uint8Array>;
  getChainId?: () => Promise<number>;
  getBlockNumber?: () => Promise<number>;
}

// Helper function to generate random bytes
const generateRandomBytes = (length: number): Uint8Array => {
  return crypto.getRandomValues(new Uint8Array(length));
};

export const XmtpProvider: React.FC<XmtpProviderProps> = ({ children }) => {
  logger.info('XmtpProvider initializing...');
  
  const [client, setClient] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Add state for attachment module
  const [attachmentModule, setAttachmentModule] = useState<{
    ContentTypeAttachment: any;
    AttachmentCodec: any;
    RemoteAttachmentCodec: any;
    ContentTypeRemoteAttachment: any;
    isLoaded: boolean;
  }>({
    ContentTypeAttachment: null,
    AttachmentCodec: null,
    RemoteAttachmentCodec: null,
    ContentTypeRemoteAttachment: null,
    isLoaded: false
  });
  
  // Add refs to track connection attempts and prevent race conditions
  const connectionAttemptedRef = useRef(false);
  const clientCreationInProgressRef = useRef(false);
  const encryptionKeyRef = useRef<Uint8Array | null>(null);
  
  logger.debug('XmtpProvider state:', { 
    hasClient: !!client, 
    isConnected, 
    isConnecting, 
    walletAddress, 
    hasError: !!connectionError
  });
  
  // Load the attachment module
  useEffect(() => {
    const loadAttachmentModule = async () => {
      try {
        const module = await loadXmtpAttachmentModule();
        setAttachmentModule({
          ...module,
          isLoaded: true
        });
        logger.info('Attachment module loaded successfully');
        
        // If client is already available, register codecs immediately
        if (client) {
          registerCodecs(client, module);
        }
      } catch (error) {
        logger.error('Failed to load attachment module:', error);
      }
    };
    
    loadAttachmentModule();
  }, [client]); // Add client as a dependency to reload when client changes
  
  // Helper function to register codecs with the client
  const registerCodecs = (clientInstance: any, moduleInstance: any) => {
    try {
      // Try different registration methods based on client SDK version
      if (typeof clientInstance.registerCodec === 'function') {
        logger.info('Using registerCodec method to register codecs');
        
        // Try to register the attachment codec
        if (moduleInstance.AttachmentCodec) {
          try {
            const attachmentCodec = new moduleInstance.AttachmentCodec();
            clientInstance.registerCodec(attachmentCodec);
            logger.info('Registered AttachmentCodec successfully');
          } catch (error) {
            logger.error('Failed to register AttachmentCodec:', error);
          }
        }
        
        // Try to register the remote attachment codec
        if (moduleInstance.RemoteAttachmentCodec) {
          try {
            const remoteAttachmentCodec = new moduleInstance.RemoteAttachmentCodec();
            clientInstance.registerCodec(remoteAttachmentCodec);
            logger.info('Registered RemoteAttachmentCodec successfully');
          } catch (error) {
            logger.error('Failed to register RemoteAttachmentCodec:', error);
          }
        }
      } 
      // Check if the client has a contentTypeRegistry property
      else if (clientInstance.contentTypeRegistry) {
        logger.info('Using contentTypeRegistry to register codecs');
        
        // Register the attachment codec
        if (moduleInstance.ContentTypeAttachment && moduleInstance.AttachmentCodec) {
          clientInstance.contentTypeRegistry.register({
            contentType: 'xmtp.org/attachment:1.0',
            contentFallback: 'Attachment',
            encode: (content: any) => {
              const codec = new moduleInstance.AttachmentCodec();
              return codec.encode(content);
            },
            decode: (content: any) => {
              const codec = new moduleInstance.AttachmentCodec();
              return codec.decode(content);
            }
          });
          logger.info('Registered attachment codec via contentTypeRegistry');
        }
        
        // Register the remote attachment codec
        if (moduleInstance.ContentTypeRemoteAttachment && moduleInstance.RemoteAttachmentCodec) {
          clientInstance.contentTypeRegistry.register({
            contentType: 'xmtp.org/remote-attachment:1.0',
            contentFallback: 'Remote Attachment',
            encode: (content: any) => {
              const codec = new moduleInstance.RemoteAttachmentCodec();
              return codec.encode(content);
            },
            decode: (content: any) => {
              const codec = new moduleInstance.RemoteAttachmentCodec();
              return codec.decode(content);
            }
          });
          logger.info('Registered remote attachment codec via contentTypeRegistry');
        }
      }
      // Try direct property assignment as a last resort
      else {
        logger.warn('No standard method available to register codecs, trying direct registration');
        
        try {
          // Try to register codecs directly on client instance (depends on SDK version)
          if (clientInstance.codecs && Array.isArray(clientInstance.codecs)) {
            if (moduleInstance.AttachmentCodec) {
              clientInstance.codecs.push(new moduleInstance.AttachmentCodec());
            }
            if (moduleInstance.RemoteAttachmentCodec) {
              clientInstance.codecs.push(new moduleInstance.RemoteAttachmentCodec());
            }
            logger.info('Added codecs directly to client.codecs array');
          }
          // Some versions might support an add method on the codecs property
          else if (clientInstance.codecs && typeof clientInstance.codecs.add === 'function') {
            if (moduleInstance.AttachmentCodec) {
              clientInstance.codecs.add(new moduleInstance.AttachmentCodec());
            }
            if (moduleInstance.RemoteAttachmentCodec) {
              clientInstance.codecs.add(new moduleInstance.RemoteAttachmentCodec());
            }
            logger.info('Added codecs using client.codecs.add method');
          }
          // Last resort - monkey patch the decode method to handle attachments
          else {
            // This is a very aggressive approach but might work as a last resort
            logger.warn('Using aggressive patch to handle attachment content types');
            
            // Store original decodeContent method if it exists
            const originalDecodeContent = clientInstance.decodeContent || 
              (clientInstance.messaging && clientInstance.messaging.decodeContent);
            
            if (originalDecodeContent && typeof originalDecodeContent === 'function') {
              // Create a bound version of the original function
              const boundOriginalDecodeContent = originalDecodeContent.bind(clientInstance);
              
              // Override to handle attachment content types
              const patchedDecodeContent = async (content: any, contentType?: any) => {
                try {
                  // Use the bound original method
                  return await boundOriginalDecodeContent(content, contentType);
                } catch (error) {
                  logger.warn('Error in decodeContent, using fallback:', error);
                  
                  // Prevent infinite recursion
                  if (patchedDecodeContent.isHandlingError) {
                    logger.error('Recursive call to patchedDecodeContent detected, returning original content');
                    return content;
                  }
                  
                  // Check if this is a codec not found error for our content types
                  if (error instanceof Error && 
                     (error.message.includes('Codec not found') || 
                      error.message.includes('codecFor') || 
                      error.message.includes('undefined'))) {
                    
                    logger.warn('Intercepted codec error, using fallback decoders');
                    
                    // Set flag to prevent recursion
                    patchedDecodeContent.isHandlingError = true;
                    
                    try {
                      // Try to identify content type
                      const contentTypeStr = content?.contentType?.toString() || 
                                             contentType?.toString() || 
                                             '';
                      
                      // Handle attachment content
                      if (contentTypeStr.includes('attachment') && moduleInstance.AttachmentCodec) {
                        logger.info('Using fallback attachment decoder for:', contentTypeStr);
                        
                        // Instead of using the codec directly, use a safer approach
                        try {
                          // Create a simple object with the content
                          if (typeof content === 'object' && content !== null) {
                            // Extract data without triggering codec
                            return {
                              filename: content.filename || 'attachment',
                              mimeType: content.mimeType || 'application/octet-stream',
                              data: content.data || new Uint8Array(),
                            };
                          }
                          return content;
                        } catch (innerError) {
                          logger.error('Error in fallback decoder:', innerError);
                          return content;
                        }
                      }
                      
                      // Handle remote attachment
                      if (contentTypeStr.includes('remote-attachment') && moduleInstance.RemoteAttachmentCodec) {
                        logger.info('Using fallback remote attachment decoder for:', contentTypeStr);
                        
                        // Instead of using the codec directly, use a safer approach
                        try {
                          // Create a simple object with the content
                          if (typeof content === 'object' && content !== null) {
                            // Extract data without triggering codec
                            return {
                              filename: content.filename || 'remote-attachment',
                              mimeType: content.mimeType || 'application/octet-stream',
                              url: content.url || '',
                            };
                          }
                          return content;
                        } catch (innerError) {
                          logger.error('Error in fallback decoder:', innerError);
                          return content;
                        }
                      }
                    } finally {
                      // Clear flag
                      patchedDecodeContent.isHandlingError = false;
                    }
                  }
                  throw error;
                }
              };
              
              // Add flag property to function
              patchedDecodeContent.isHandlingError = false;
              
              // Apply the patched method
              if (clientInstance.decodeContent) {
                clientInstance.decodeContent = patchedDecodeContent;
              } else if (clientInstance.messaging && clientInstance.messaging.decodeContent) {
                clientInstance.messaging.decodeContent = patchedDecodeContent;
              }
            }
          }
          
          logger.info('Attempted direct codec registration as fallback');
        } catch (directError) {
          logger.error('Failed to register codecs using direct methods:', directError);
        }
      }
    } catch (error) {
      logger.error('Failed to register codecs:', error);
    }
  };

  // Load conversations when client is available
  const loadConversations = useCallback(async () => {
    if (!client) {
      logger.warn('Cannot load conversations: No XMTP client available');
      return;
    }
    
    try {
      logger.info('Loading conversations...');
      
      // First, sync conversations to ensure we have the latest data
      try {
        logger.debug('Syncing conversations before loading...');
        await client.conversations.sync();
        logger.debug('Conversations synced successfully');
      } catch (syncError) {
        logger.warn('Error syncing conversations:', syncError);
        // Continue anyway, as we might still be able to list existing conversations
      }
      
      const convos = await client.conversations.list();
      logger.info(`Loaded ${convos.length} conversations`);
      
      // Log peer addresses for debugging
      const peerAddresses = convos.map((convo: any) => convo.peerAddress?.toLowerCase());
      logger.debug('Conversation peer addresses:', peerAddresses);
      
      // Check if we have a conversation with the bot
      const hasBotConvo = peerAddresses.includes(SCARLETT_BOT_ADDRESS.toLowerCase());
      logger.debug(`Has bot conversation: ${hasBotConvo}`);
      
      // Map conversations to our format
      const formattedConvos = convos.map((convo: any) => ({
        id: convo.topic || convo.conversationId,
        peerAddress: convo.peerAddress,
        updatedAt: convo.updatedAt,
        isBot: convo.peerAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase(),
        messages: []
      }));
      
      setConversations(formattedConvos);
    } catch (error) {
      logger.error('Error loading conversations:', error);
    }
  }, [client]);
  
  // Get or create encryption key with improved persistence
  const getOrCreateEncryptionKey = useCallback((address: string): Uint8Array => {
    // If we already have the key in memory, use it
    if (encryptionKeyRef.current) {
      logger.debug('Using encryption key from memory');
      return encryptionKeyRef.current;
    }
    
    const storageKey = `xmtp-key-${address.toLowerCase()}`;
    let keyData = localStorage.getItem(storageKey);
    
    if (!keyData) {
      // No key found, generate a new one
      const newKey = window.crypto.getRandomValues(new Uint8Array(32));
      // Convert to base64 for storage
      keyData = btoa(String.fromCharCode.apply(null, Array.from(newKey)));
      localStorage.setItem(storageKey, keyData);
      logger.info('Generated and stored new encryption key');
      
      // Store in memory
      encryptionKeyRef.current = newKey;
      return newKey;
    } else {
      logger.info('Using existing encryption key from storage');
      
      // Convert from base64 back to Uint8Array
      const keyBytes = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
      logger.debug('Encryption key byte length:', keyBytes.length);
      
      // Store in memory
      encryptionKeyRef.current = keyBytes;
      return keyBytes;
    }
  }, []);
  
  // Create an ethers signer for XMTP
  const createEthersSigner = useCallback(async (address: string): Promise<CustomXmtpSigner> => {
    logger.info('Creating ethers signer for XMTP...');
    
    try {
      // Check if window.ethereum is available
      if (!window.ethereum) {
        throw new Error('No ethereum provider found');
      }
      
      // Create an ethers provider
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      const ethersSigner = provider.getSigner();
      
      // Try to determine if this is a smart contract wallet
      let isSmartContractWallet = false;
      try {
        // Check if the address has code - if it does, it's a smart contract wallet
        const code = await provider.getCode(address);
        isSmartContractWallet = code !== '0x';
        logger.info(`Wallet type detection: address ${address} has code: ${isSmartContractWallet ? 'Yes (SCW)' : 'No (EOA)'}`);
      } catch (error) {
        logger.warn('Could not determine wallet type, assuming EOA:', error);
      }
      
      // Get the chain ID
      let chainId: number;
      try {
        const network = await provider.getNetwork();
        chainId = network.chainId;
        logger.info(`Chain ID: ${chainId}`);
      } catch (error) {
        logger.warn('Could not get chain ID, using default 8453 (Base):', error);
        chainId = 8453; // Default to Base
      }
      
      // Create a signer that directly uses the ethers signer
      // This approach is more compatible with XMTP's expected signature format
      const xmtpSigner: CustomXmtpSigner = {
        walletType: isSmartContractWallet ? "Contract" : "EOA",
        getAddress: async () => {
          return address;
        },
        signMessage: async (message: string) => {
          logger.info(`Signing message with ${isSmartContractWallet ? 'SCW' : 'EOA'} wallet`);
          logger.debug('Message to sign:', message);
          
          try {
            // Use the ethers signer to sign the message
            // This will handle the correct signature format for XMTP
            const signature = await ethersSigner.signMessage(message);
            logger.debug('Signature:', signature);
            
            // Convert hex string to Uint8Array as required by XMTP
            // This is the key part for compatibility with XMTP
            return ethers.utils.arrayify(signature);
          } catch (signError) {
            logger.error(`Error signing message with ${isSmartContractWallet ? 'SCW' : 'EOA'}:`, signError);
            throw signError;
          }
        }
      };
      
      // Add additional properties for SCW if needed
      if (isSmartContractWallet) {
        // Add required properties for SCW
        (xmtpSigner as any).getChainId = async () => {
          return chainId;
        };
        
        (xmtpSigner as any).getBlockNumber = async () => {
          try {
            const blockNumber = await provider.getBlockNumber();
            return blockNumber;
          } catch (error) {
            logger.warn('Could not get block number:', error);
            // Return a default block number instead of undefined
            return 0;
          }
        };
      }
      
      logger.info(`Created ${isSmartContractWallet ? 'SCW' : 'EOA'} signer for XMTP`);
      return xmtpSigner;
    } catch (error) {
      logger.error('Error creating ethers signer:', error);
      throw error;
    }
  }, []);

  // Connect to XMTP with a signer
  const connectXmtp = async (signer: any) => {
    logger.info('Connecting to XMTP...');
    if (clientCreationInProgressRef.current) {
      logger.warn('Client creation already in progress, ignoring duplicate request');
      return;
    }

    if (!signer) {
      setConnectionError(new Error('No signer provided'));
      return;
    }

    clientCreationInProgressRef.current = true;
    setIsConnecting(true);
    setConnectionError(null);

    try {
      logger.debug('Starting client creation with signer', { signer });
      
      // Generate a new database encryption key if we don't have one
      if (!encryptionKeyRef.current) {
        encryptionKeyRef.current = generateRandomBytes(32);
        logger.debug('Generated new database encryption key');
      }
      
      // Try to load the attachment module and prepare codecs before client creation
      try {
        const { applyBufferPolyfill } = await import('../utils/bufferPolyfill');
        applyBufferPolyfill();
        logger.info('Buffer polyfill applied before client creation');
      } catch (bufferError) {
        logger.warn('Failed to apply Buffer polyfill:', bufferError);
      }
      
      // Load attachment module before client creation
      let attachmentCodecs: any[] = [];
      try {
        logger.info('Pre-loading attachment module for client creation');
        const module = await loadXmtpAttachmentModule();
        if (module && module.AttachmentCodec && module.RemoteAttachmentCodec) {
          // Create codec instances
          const attachmentCodec = new module.AttachmentCodec();
          const remoteAttachmentCodec = new module.RemoteAttachmentCodec();
          
          // Save them for direct inclusion in client options
          attachmentCodecs = [attachmentCodec, remoteAttachmentCodec];
          
          // Also update the module state
          setAttachmentModule({
            ...module,
            isLoaded: true
          });
          
          logger.info('Prepared attachment codecs for client creation');
        }
      } catch (moduleError) {
        logger.warn('Failed to pre-load attachment module:', moduleError);
      }
      
      // Try to get the wallet address
      let address = null;
      try {
        address = await signer.getAddress();
        setWalletAddress(address);
        logger.info(`Using wallet address: ${address}`);
      } catch (addressError) {
        logger.error('Could not get wallet address:', addressError);
      }
      
      // Create a custom XMTP-compatible signer
      let xmtpSigner;
      
      // Check if this is an ethers v5 signer
      if (signer._isSigner && typeof signer.signMessage === 'function') {
        logger.info('Using Ethers v5 signer for XMTP');
        
        // Create a simplified signer that XMTP can use
        xmtpSigner = {
          getAddress: async () => {
            return address;
          },
          signMessage: async (message: string) => {
            logger.info('Signing message with Ethers v5');
            try {
              // Sign the message with ethers
              const signature = await signer.signMessage(message);
              logger.debug('Signature:', signature);
              
              // Convert to the format XMTP expects
              return ethers.utils.arrayify(signature);
            } catch (signError) {
              logger.error('Error signing message:', signError);
              throw signError;
            }
          }
        };
      } else {
        // Use the original signer if it's not an ethers signer
        logger.info('Using provided signer directly');
        xmtpSigner = signer;
      }
      
      // Create the client with correct parameter order: signer, encryptionKey, options
      let clientInstance;
      
      try {
        // Create the client with correct parameter order: signer, encryptionKey, options
        logger.info('Creating XMTP client with custom signer');
        clientInstance = await Client.create(
          xmtpSigner, 
          encryptionKeyRef.current as Uint8Array, 
          {
            env: 'dev', // Use development environment
            codecs: attachmentCodecs // Pass codecs directly during creation
          }
        );
        
        logger.info('XMTP client created successfully');
      } catch (createError) {
        logger.error('Failed to create XMTP client:', createError);
        logDetailedError(createError as Error, 'XMTP Client Creation');
        throw createError;
      }
      
      // Load and register attachment codecs immediately after client creation
      try {
        logger.info('Loading attachment codecs for immediate registration');
        const module = await loadXmtpAttachmentModule();
        
        if (module && module.AttachmentCodec) {
          // Attempt immediate registration
          registerCodecs(clientInstance, module);
          
          // Also update the state for later use if needed
          setAttachmentModule({
            ...module,
            isLoaded: true
          });
        } else {
          logger.warn('Attachment module could not be loaded properly');
        }
      } catch (codecError) {
        logger.error('Failed to register attachment codecs immediately:', codecError);
        // Continue without the codecs for now
      }
      
      // Set state with the new client
      setClient(clientInstance);
      setIsConnected(true);
      
      // Load existing conversations
      try {
        await loadConversations();
      } catch (convError) {
        logger.warn('Cannot load conversations:', convError);
      }
      
      // Success
      clientCreationInProgressRef.current = false;
      connectionAttemptedRef.current = true;
      setIsConnecting(false);
      logger.info('XMTP connection completed successfully');
    } catch (error) {
      // Connection failed
      clientCreationInProgressRef.current = false;
      connectionAttemptedRef.current = true;
      setIsConnecting(false);
      setIsConnected(false);
      setClient(null);
      
      // Set and log the error
      const formattedError = error instanceof Error ? error : new Error(String(error));
      setConnectionError(formattedError);
      logDetailedError(error, 'XMTP connection failed');
      
      throw formattedError;
    }
  };

  // Disconnect from XMTP
  const disconnectXmtp = () => {
    logger.info('Disconnecting from XMTP');
    setClient(null);
    setConversations([]);
    setIsConnected(false);
    setConnectionError(null);
  };

  // Clear cached XMTP data and reset connection
  const resetXmtpConnection = () => {
    logger.info('Resetting XMTP connection and clearing cached data...');
    
    // Disconnect current client
    disconnectXmtp();
    
    // Reset connection attempt flag
    connectionAttemptedRef.current = false;
    
    // Clear in-memory encryption key
    encryptionKeyRef.current = null;
    
    // Clear in-memory signature cache
    signatureCache.clear();
    
    // Clear cached data for the current address
    if (walletAddress) {
      const address = walletAddress.toLowerCase();
      
      // Clear client cache
      localStorage.removeItem(`xmtp-client-${address}`);
      
      // Clear encryption key
      localStorage.removeItem(`xmtp-key-${address}`);
      
      // Clear wallet type cache
      localStorage.removeItem(`wallet-type-${address}`);
      
      // Clear all signature caches (this will clear all signatures for all addresses)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('xmtp-signature-') || 
          key.startsWith(`xmtp-key-${address}`) || 
          key.startsWith(`xmtp-client-${address}`) ||
          key.startsWith(`wallet-type-${address}`)
        )) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      logger.info(`Cleared ${keysToRemove.length} cached items for address ${address}`);
    }
  };

  // Send a message to a conversation
  const sendMessage = async (conversationId: string, message: string | object) => {
      if (!client) {
      logger.error('Cannot send message: No XMTP client available');
      throw new Error('No XMTP client available');
    }
    
    try {
      logger.info(`Sending message to conversation ${conversationId}`);
      
      // Find the conversation
      const conversation = await client.conversations.getConversationById(conversationId);
      if (!conversation) {
        logger.error(`Conversation ${conversationId} not found`);
        throw new Error(`Conversation ${conversationId} not found`);
      }
      
      // Send the message
      const sent = await conversation.send(message);
      logger.info('Message sent successfully');
      logger.debug('Sent message:', sent);
      
      return sent;
    } catch (error) {
      logger.error('Error sending message:', error);
      throw error;
    }
  };

  // Check if we can message a specific address
  const canMessage = async (address: string) => {
    if (!client) {
      logger.error('Cannot check canMessage: No XMTP client available');
      throw new Error('No XMTP client available');
    }
    
    try {
      logger.info(`Checking canMessage for address: ${address}`);
      
      // Special handling for bot address - always return true
      if (address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
        logger.debug(`Special handling for bot address ${address}: Always allowing messages`);
        return true;
      }
      
      // Check with the XMTP network
      const results = await client.canMessage([address]);
      const canMessageAddress = results.get(address) || false;
      
      logger.info(`Can message ${address}: ${canMessageAddress}`);
      return canMessageAddress;
    } catch (error) {
      logger.error('Error checking canMessage:', error);
      
      // Special case for bot address - still return true even on error
      if (address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
        return true;
      }
      
      return false;
    }
  };

  // Get or create a conversation with an address
  const getOrCreateConversation = async (address: string) => {
    if (!client) {
      logger.error('Cannot get conversation: No XMTP client available');
      throw new Error('No XMTP client available');
    }
    
    try {
      logger.info(`Getting or creating conversation with ${address}`);
      
      // First, sync conversations to ensure we have the latest data
      logger.debug('Syncing conversations...');
      try {
        await client.conversations.sync();
        logger.debug('Conversations synced successfully');
      } catch (syncError) {
        logger.warn('Error syncing conversations:', syncError);
        // Continue anyway, as we might still be able to create a new conversation
      }
      
      // Log client capabilities and network
      logger.debug('XMTP client details:', {
        address: await (client as any).address,
        environment: (client as any).env,
        apiUrl: (client as any).apiUrl,
      });
      
      // Special handling for bot address
      const isBotAddress = address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase();
      
      // Check if we can message this address (skip for bot address)
      if (!isBotAddress) {
        logger.debug(`Checking if we can message ${address}`);
        const canMessageAddress = await canMessage(address);
        if (!canMessageAddress) {
          logger.warn(`Cannot message address ${address} - not on XMTP network`);
          throw new Error(`Cannot message address ${address} - not on XMTP network`);
        }
      }
      
      // Try to find an existing conversation
      logger.debug(`Looking for existing conversation with ${address}`);
      const existingConversations = await client.conversations.list();
      const existingConvo = existingConversations.find(
        (convo: any) => {
          // Check for peerAddress in DMs
          if (convo.peerAddress) {
            return convo.peerAddress.toLowerCase() === address.toLowerCase();
          }
          
          // For newer SDK versions, check for DM peer
          if (typeof convo.dmPeerInboxId === 'function') {
            try {
              const peerInboxId = convo.dmPeerInboxId();
              // We would need to convert address to inboxId for comparison
              // This is a simplified check
              return peerInboxId && peerInboxId.includes(address.toLowerCase());
            } catch (e) {
              return false;
            }
          }
          
          return false;
        }
      );
      
      if (existingConvo) {
        logger.info(`Found existing conversation with ${address}`);
        return existingConvo;
      }
      
      // Create a new conversation - use newDm instead of newConversation
      logger.info(`Creating new conversation with ${address}`);
      const newConvo = await client.conversations.newDm(address);
      
      // Add to our list of conversations
      const formattedConvo = {
        id: newConvo.id || newConvo.topic || (newConvo as any).conversationId,
        peerAddress: address,
        updatedAt: new Date(),
        isBot: address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase(),
        messages: []
      };
      
      setConversations(prev => [...prev, formattedConvo]);
      
      return newConvo;
    } catch (error) {
      logger.error(`Error getting or creating conversation with ${address}:`, error);
      throw error;
    }
  };

  // Create a conversation with the bot
  const createBotConversation = async () => {
    try {
      logger.info('Creating bot conversation...');
      
      // Check if client is available
      if (!client) {
        logger.error('Cannot create bot conversation: No XMTP client available');
        
        // Try to reconnect if we have a wallet address
        if (walletAddress) {
          logger.info('Attempting to reconnect XMTP before creating bot conversation...');
          try {
            await connectWithEthers();
            logger.info('Reconnection successful, proceeding with bot conversation creation');
          } catch (reconnectError) {
            logger.error('Failed to reconnect XMTP:', reconnectError);
            throw new Error('Failed to connect to XMTP for bot conversation');
          }
        } else {
          throw new Error('No XMTP client available and no wallet address to reconnect');
        }
      }
      
      // Check for existing conversations with the bot
      logger.debug('Looking for existing conversation with bot');
      const existingConversations = await client.conversations.list();
      const botConvo = existingConversations.find(
        (convo: any) => convo.peerAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()
      );
      
      if (botConvo) {
        logger.info('Found existing bot conversation');
        return botConvo;
      }
      
      // Create a new conversation with the bot using newDm (not newConversation)
      logger.info('Creating new conversation with bot');
      try {
        const newConvo = await client.conversations.newDm(SCARLETT_BOT_ADDRESS);
        
        // Add to our list of conversations
        const formattedConvo = {
          id: newConvo.topic || newConvo.id || (newConvo as any).conversationId,
          peerAddress: SCARLETT_BOT_ADDRESS,
          updatedAt: new Date(),
          isBot: true,
          messages: []
        };
        
        setConversations(prev => [...prev, formattedConvo]);
        
        return newConvo;
      } catch (error) {
        logger.error('Error creating bot conversation with newDm:', error);
        throw error;
      }
    } catch (error) {
      logger.error('Error creating bot conversation:', error);
      logDetailedError(error as Error, 'Creating Bot Conversation');
      throw error;
    }
  };

  // Connect with wagmi (legacy method, kept for compatibility)
  const connectWithWagmi = async (): Promise<boolean> => {
    logger.info('Connecting with wagmi...');
    
    try {
      setIsConnecting(true);
      setConnectionError(null);
      
      // Check if we already have a client
      if (client) {
        logger.info("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        return true;
      }
      
      // Get the wagmi config
      if (!window.ethereum) {
        logger.error('No Ethereum provider found');
        setConnectionError(new Error('No Ethereum provider found'));
        setIsConnecting(false);
        return false;
      }
      
      // Create a provider
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      logger.info('Created ethers provider');
      
      // Request accounts to ensure connection
      try {
        logger.info('Requesting accounts...');
        await (window.ethereum as any).request({ method: 'eth_requestAccounts' });
        logger.info('Successfully requested accounts');
      } catch (error) {
        logger.error('Failed to request accounts:', error);
        setConnectionError(new Error('Failed to connect wallet'));
        setIsConnecting(false);
        return false;
      }
      
      // Get signer
      let signer;
      try {
        logger.info('Getting signer from provider...');
        signer = provider.getSigner();
        logger.info('Got signer from provider');
        
        // Log signer details for debugging
        const address = await signer.getAddress();
        logger.info(`Signer address: ${address}`);
      } catch (error) {
        logger.error('Failed to get signer:', error);
        setConnectionError(new Error('Failed to get signer from wallet'));
        setIsConnecting(false);
        return false;
      }
      
      // Connect to XMTP with the signer
      try {
        logger.info('Connecting to XMTP with signer...');
        
        // Add a timeout to prevent getting stuck
        const connectionPromise = connectXmtp(signer);
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => {
            reject(new Error('XMTP connection timed out after 15 seconds'));
          }, 15000); // 15 second timeout
        });
        
        // Race the connection promise against the timeout
        await Promise.race([connectionPromise, timeoutPromise]);
        
        logger.info('Successfully connected to XMTP with wagmi');
        
        // Explicitly check if we're connected after the attempt
        const connectionSuccessful = client !== null && isConnected;
        logger.info(`Connection status after attempt: ${connectionSuccessful ? 'Connected' : 'Not connected'}`);
        
        // If we're not connected but didn't get an error, log a warning
        if (!connectionSuccessful) {
          logger.warn('Connection attempt completed without error, but client is not connected');
          logger.warn('Client state:', { client: !!client, isConnected, isConnecting });
        }
        
        return connectionSuccessful; // Return the actual connection state
      } catch (error) {
        logger.error('Failed to connect to XMTP with wagmi:', error);
        
        // Log detailed error information
        if (error instanceof Error) {
          logger.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
          });
        }
        
        setConnectionError(error instanceof Error ? error : new Error(String(error)));
        return false;
      } finally {
        setIsConnecting(false);
      }
    } catch (error) {
      logger.error('Error in connectWithWagmi:', error);
      setConnectionError(error instanceof Error ? error : new Error(String(error)));
      setIsConnecting(false);
      return false;
    }
  };

  // Connect with ethers
  const connectWithEthers = async (): Promise<boolean> => {
    try {
      logger.info('Connecting with ethers...');
      
      // Check if window.ethereum is available
      if (!window.ethereum) {
        logger.error('No ethereum provider found');
        throw new Error('No ethereum provider found');
      }
      
      // Create an ethers provider and signer
      const provider = new ethers.providers.Web3Provider(window.ethereum as any);
      const signer = provider.getSigner();
      const address = await signer.getAddress();
      
      // Set wallet address
      setWalletAddress(address);
      
      // If we already have a client, just return true
      if (client) {
        logger.info('Already have XMTP client, returning true');
        setIsConnected(true);
        return true;
      }
      
      // Apply buffer polyfill before client creation
      logger.info('Buffer polyfill applied before client creation');
      
      // Pre-load attachment module
      logger.info('Pre-loading attachment module for client creation');
      const attachmentCodecs = await loadAttachmentModule();
      logger.info('Prepared attachment codecs for client creation');
      
      // Create a custom signer for XMTP
      const xmtpSigner = await createEthersSigner(address);
      
      // Get encryption key for this user
      logger.info('Getting encryption key...');
      const encryptionKey = getOrCreateEncryptionKey(address);
      logger.info('Using encryption key for database');
      
      // Create client options - use only dev environment as requested
      const clientOptions = {
        env: 'dev' as const,
        codecs: attachmentCodecs,
        // Explicitly set the signature validation to be more lenient
        // This can help with signature format compatibility issues
        skipSignatureValidation: false
      };
      
      logger.info('Creating XMTP client with dev environment...');
      try {
        // Create the XMTP client with a timeout
        logger.info('Starting client creation...');
        const clientCreationPromise = Client.create(xmtpSigner as any, encryptionKey, clientOptions);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            logger.error('XMTP client creation timed out after 20 seconds');
            reject(new Error('XMTP client creation timed out after 20 seconds'));
          }, 20000); // 20 second timeout
        });
        
        // Race the client creation promise against the timeout
        logger.info('Waiting for client creation or timeout...');
        const xmtpClient = await Promise.race([clientCreationPromise, timeoutPromise]);
        
        logger.info('XMTP client created successfully');
        setClient(xmtpClient);
        setIsConnected(true);
        
        // Load conversations
        logger.info('Loading conversations...');
        await loadConversations();
        logger.info('Conversations loaded successfully');
        
        return true;
      } catch (error) {
        logger.error('Error creating XMTP client:', error);
        setConnectionError(error as Error);
        throw error;
      }
    } catch (error) {
      logger.error('Error connecting with ethers:', error);
      setConnectionError(error as Error);
      return false;
    }
  };

  // Create the context value
  const contextValue: XmtpContextType = {
    client,
    conversations,
    isConnected,
    isConnecting,
    connectionError,
    connectXmtp,
    connectWithWagmi,
    connectWithEthers,
    disconnectXmtp,
    resetXmtpConnection,
    sendMessage,
    loadConversations,
    canMessage,
    getOrCreateConversation,
    createBotConversation,
    attachmentModule
  };

  // Return the provider with the context value
  return (
    <XmtpContext.Provider value={contextValue}>
      {children}
    </XmtpContext.Provider>
  );
};