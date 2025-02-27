import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
// Import directly from @xmtp/browser-sdk
import { Client } from '@xmtp/browser-sdk';
import { XmtpContextType, Conversation } from '../types/chat';
// Import Viem and Wagmi
import { useSignMessage, useAccount, useWalletClient } from 'wagmi';
// Import ethers for alternative implementation
import { ethers } from 'ethers';
// Import constants
import { SCARLETT_BOT_ADDRESS } from '../lib/constants';

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

export const XmtpProvider: React.FC<XmtpProviderProps> = ({ children }) => {
  logger.info('XmtpProvider initializing...');
  
  const [client, setClient] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  
  // Add refs to track connection attempts and prevent race conditions
  const connectionAttemptedRef = useRef(false);
  const clientCreationInProgressRef = useRef(false);
  const encryptionKeyRef = useRef<Uint8Array | null>(null);

  // Get Wagmi account and wallet client
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const { signMessageAsync } = useSignMessage();
  
  logger.debug('XmtpProvider state:', { 
    hasClient: !!client, 
    isConnected, 
    isConnecting, 
    wagmiAddress, 
    isWagmiConnected,
    hasError: !!connectionError
  });
  
  // Load conversations when client is available
  const loadConversations = useCallback(async () => {
    if (!client) {
      logger.warn('Cannot load conversations: No XMTP client available');
      return;
    }
    
    try {
      logger.info('Loading conversations...');
      const convos = await client.conversations.list();
      logger.info(`Loaded ${convos.length} conversations`);
      
      // Map conversations to our format
      const formattedConvos = convos.map((convo: any) => ({
        id: convo.topic,
        peerAddress: convo.peerAddress,
        updatedAt: convo.updatedAt,
        messages: []
      }));
      
      setConversations(formattedConvos);
    } catch (error) {
      logger.error('Error loading conversations:', error);
    }
  }, [client]);
  
  // Detect wallet type - this is crucial for proper signature validation
  const detectWalletType = useCallback(async (address: string): Promise<"EOA" | "Contract"> => {
    try {
      logger.info(`Detecting wallet type for address: ${address}`);
      
      // First, check if we have a cached result for this address
      const cacheKey = `wallet-type-${address.toLowerCase()}`;
      const cachedType = localStorage.getItem(cacheKey);
      
      if (cachedType) {
        logger.info(`Using cached wallet type for ${address}: ${cachedType}`);
        return cachedType as "EOA" | "Contract";
      }
      
      // Check if the address has code deployed (indicating a contract wallet)
      if (wagmiWalletClient) {
        try {
          // Use a more compatible approach to check for contract code
          // @ts-ignore - Access the public client to check code
          const code = await wagmiWalletClient.chain.rpcUrls.default.http[0];
          
          // If we have an RPC URL, we can use ethers to check the code
          if (code) {
            const provider = new ethers.JsonRpcProvider(code);
            const bytecode = await provider.getCode(address);
            
            // If there's code at this address, it's a contract wallet
            if (bytecode && bytecode !== '0x') {
              logger.info(`Detected wallet type for ${address}: Contract Wallet`);
              localStorage.setItem(cacheKey, "Contract");
              return "Contract";
            }
          }
        } catch (error) {
          logger.warn(`Error checking code at address, will try alternative method:`, error);
        }
      }
      
      // Additional heuristics for known smart contract wallet patterns
      // Check address format or other characteristics that might indicate a smart contract wallet
      
      // For Safe (formerly Gnosis Safe) wallets, they often have specific patterns
      // This is a simplified check and might need to be expanded based on your specific wallet types
      if (address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
        logger.info(`Address ${address} matches bot address, treating as Contract Wallet`);
        localStorage.setItem(cacheKey, "Contract");
        return "Contract";
      }
      
      // Default to EOA if we couldn't determine it's a contract
      logger.info(`Detected wallet type for ${address}: EOA (default)`);
      localStorage.setItem(cacheKey, "EOA");
      return "EOA";
    } catch (error) {
      logger.warn(`Error detecting wallet type, defaulting to EOA:`, error);
      return "EOA";
    }
  }, [wagmiWalletClient]);
  
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
  
  // Create a signer using Wagmi hooks with improved caching and error handling
  const createWagmiSigner = useCallback(async () => {
    if (!wagmiAddress) {
      logger.error('No Wagmi address available');
      return null;
    }
    
    logger.info('Creating Wagmi signer for address:', wagmiAddress);
    
    // Detect wallet type
    const walletType = await detectWalletType(wagmiAddress);
    
    return {
      walletType: walletType,
      getAddress: async () => {
        logger.debug('Wagmi signer getAddress called, returning:', wagmiAddress);
        return wagmiAddress;
      },
      signMessage: async (message: string) => {
        try {
          logger.info('Signing message with Wagmi...');
          logger.debug('Message to sign:', message);
          logger.signature('Signing message content:', message);
          
          // Check if we have a cached signature for this message
          const cacheKey = `${wagmiAddress.toLowerCase()}-${message}`;
          if (signatureCache.has(cacheKey)) {
            const cachedSignature = signatureCache.get(cacheKey);
            logger.info('Using cached signature');
            logger.signature('Using cached signature:', cachedSignature);
            
            // Convert cached signature to Uint8Array if it's a string
            if (typeof cachedSignature === 'string') {
              logger.info('Converting cached signature from string to Uint8Array');
              return ethers.getBytes(cachedSignature);
            }
            return cachedSignature;
          }
          
          // Use Wagmi's signMessage hook
          logger.info('Requesting new signature via Wagmi signMessageAsync...');
          let signature;
          try {
            signature = await signMessageAsync({ message });
            logger.info('Successfully signed with Wagmi');
            logger.signature('Signature result:', signature);
            
            // Log signature format details for debugging
            if (signature) {
              logger.signature('Signature format details:', {
                length: signature.length,
                prefix: signature.substring(0, 10),
                isHexString: signature.startsWith('0x'),
                byteLength: signature.startsWith('0x') ? (signature.length - 2) / 2 : null
              });
            }
            
            // Convert signature to Uint8Array for XMTP
            if (typeof signature === 'string') {
              logger.info('Converting signature from string to Uint8Array');
              const signatureBytes = ethers.getBytes(signature);
              
              // Cache the original string signature
              signatureCache.set(cacheKey, signature);
              
              return signatureBytes;
            }
          } catch (signError: any) {
            logger.error('Error during signature process:');
            logDetailedError(signError, 'Signature');
            throw signError;
          }
          
          // Cache the signature
          signatureCache.set(cacheKey, signature);
          
          return signature;
        } catch (error) {
          logger.error('Error signing with Wagmi:');
          logDetailedError(error, 'Wagmi Signing');
          throw error;
        }
      },
      // Add getChainId method for completeness
      getChainId: async () => {
        if (wagmiWalletClient) {
          return wagmiWalletClient.chain.id;
        }
        // Default to mainnet if we can't determine
        return 1;
      }
    };
  }, [wagmiAddress, signMessageAsync, wagmiWalletClient, detectWalletType]);

  // Connect to XMTP with improved error handling and logging
  const connectXmtp = async (signer: any) => {
    try {
      logger.info("Starting XMTP connection process...");
      
      // Reset any previous connection errors
      setConnectionError(null);
      
      // Prevent multiple simultaneous connection attempts
      if (clientCreationInProgressRef.current) {
        logger.warn("XMTP client creation already in progress, skipping");
        return;
      }
      
      setIsConnecting(true);
      clientCreationInProgressRef.current = true;
      
      // Check if we already have a client
      if (client) {
        logger.info("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        clientCreationInProgressRef.current = false;
        return;
      }
      
      // Get the address from the signer for logging
      let address;
      try {
        address = await signer.getAddress();
        logger.info('Signer address:', address);
      } catch (error) {
        logger.error('Error getting address from signer:', error);
        setIsConnecting(false);
        clientCreationInProgressRef.current = false;
        setConnectionError(new Error('Failed to get address from signer'));
        throw new Error('Failed to get address from signer');
      }
      
      logger.info('Creating XMTP client with signer');
      
      // Log signer details for debugging
      logger.debug('Signer details:', {
        walletType: signer.walletType,
        hasGetAddress: typeof signer.getAddress === 'function',
        hasSignMessage: typeof signer.signMessage === 'function',
        hasGetChainId: typeof signer.getChainId === 'function'
      });
      
      // Get encryption key for this user
      const encryptionKey = getOrCreateEncryptionKey(address);
      logger.info('Using encryption key for database');
      
      // Verify the encryption key is valid
      if (!encryptionKey || encryptionKey.length !== 32) {
        const error = new Error('Invalid encryption key: must be exactly 32 bytes');
        logger.error('Invalid encryption key length:', encryptionKey ? encryptionKey.length : 'null');
        clientCreationInProgressRef.current = false;
        setConnectionError(error);
        throw error;
      }
      
      // Determine if this is a bot address
      const isBot = address.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase();
      if (isBot) {
        logger.info('Connecting with bot address, ensuring wallet type is set to Contract');
        signer.walletType = "Contract";
      }
      
      // Create client options with appropriate environment
      const clientOptions = {
        env: 'dev' as const, // Start with dev environment
        // Force the wallet type if we know it's a contract wallet
        ...(signer.walletType === "Contract" ? { codecs: [] } : {})
      };
      
      logger.info(`Creating XMTP client with options:`, clientOptions);
      
      // Try connecting with different environments
      const environments = ['dev', 'production'] as const;
      let xmtpClient = null;
      let lastError = null;
      
      for (const env of environments) {
        try {
          logger.info(`Attempting to create XMTP client with ${env} environment...`);
          
          // Update environment in options
          const envOptions = {
            ...clientOptions,
            env: env
          };
          
          xmtpClient = await Client.create(signer, encryptionKey, envOptions);
          
          logger.info(`XMTP client created successfully with ${env} environment`);
          break; // Exit the loop if successful
        } catch (error: any) {
          lastError = error;
          logger.error(`Error creating XMTP client with ${env} environment:`, error);
          logDetailedError(error, `XMTP Client Creation (${env})`);
          
          // If this is not the last environment to try, continue to the next one
          if (env !== environments[environments.length - 1]) {
            logger.info(`Trying next environment...`);
          }
        }
      }
      
      // If we successfully created a client
      if (xmtpClient) {
        setClient(xmtpClient);
        setIsConnected(true);
        
        // Load conversations
        await loadConversations();
      } else {
        // If all attempts failed, throw the last error
        if (lastError) {
          setConnectionError(lastError);
          throw lastError;
        } else {
          const error = new Error('Failed to create XMTP client with all environments');
          setConnectionError(error);
          throw error;
        }
      }
    } catch (error) {
      logger.error('Error connecting to XMTP:', error);
      setConnectionError(error as Error);
      throw error;
    } finally {
      setIsConnecting(false);
      clientCreationInProgressRef.current = false;
    }
  };

  // Function to directly connect using Wagmi with improved error handling
  const connectWithWagmi = async () => {
    if (!wagmiAddress) {
      const error = new Error('No Wagmi address available');
      logger.error('Cannot connect to XMTP: No Wagmi address available');
      setConnectionError(error);
      throw error;
    }
    
    logger.info('Connecting to XMTP with Wagmi...');
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      // Check if we already have a client
      if (client) {
        logger.info("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        return true;
      }
      
      // Mark that we've attempted connection
      connectionAttemptedRef.current = true;
      
      // Create a more robust signer with detailed logging
      logger.info('Creating Wagmi signer with address:', wagmiAddress);
      logger.debug('Wagmi wallet client available:', !!wagmiWalletClient);
      
      const wagmiSigner = await createWagmiSigner();
      if (!wagmiSigner) {
        const error = new Error('Failed to create Wagmi signer');
        setConnectionError(error);
        throw error;
      }
      
      await connectXmtp(wagmiSigner);
      logger.info('Successfully connected to XMTP with Wagmi');
      return true;
    } catch (error) {
      logger.error('Failed to connect to XMTP with Wagmi:', error);
      // Reset connection attempt flag to allow retrying
      connectionAttemptedRef.current = false;
      setConnectionError(error as Error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Try to connect with ethers.js as an alternative
  const connectWithEthers = async () => {
    if (!wagmiAddress) {
      const error = new Error('No Wagmi address available');
      logger.error('Cannot connect to XMTP: No Wagmi address available');
      setConnectionError(error);
      throw error;
    }
    
    logger.info('Attempting to connect to XMTP with ethers.js...');
    setIsConnecting(true);
    setConnectionError(null);
    
    try {
      // Check if we already have a client
      if (client) {
        logger.info("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        return true;
      }
      
      // Check if window.ethereum is available
      if (!window.ethereum) {
        const error = new Error('No ethereum provider found. Please install a wallet.');
        setConnectionError(error);
        throw error;
      }
      
      // Create an ethers provider with proper type assertion
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      logger.info('Created ethers provider:', !!provider);
      
      // Get the signer
      const ethersSigner = await provider.getSigner();
      logger.info('Got ethers signer with address:', await ethersSigner.getAddress());
      
      // Create a signer adapter for XMTP
      const xmtpEthersSigner = {
        walletType: "EOA" as const,
        getAddress: async () => {
          return await ethersSigner.getAddress();
        },
        signMessage: async (message: string) => {
          logger.info('Signing message with ethers');
          logger.debug('Message to sign:', message);
          // Convert the string signature to Uint8Array as required by XMTP
          const signature = await ethersSigner.signMessage(message);
          logger.debug('Signature:', signature);
          // Convert hex string to Uint8Array
          return ethers.getBytes(signature);
        },
        getChainId: async () => {
          const network = await provider.getNetwork();
          return Number(network.chainId);
        }
      };
      
      // Get encryption key for this user
      const address = await ethersSigner.getAddress();
      const encryptionKey = getOrCreateEncryptionKey(address);
      
      // Create the XMTP client
      logger.info('Creating XMTP client with ethers signer...');
      const xmtpClient = await Client.create(xmtpEthersSigner, encryptionKey, {
        env: 'dev',
      });
      
      logger.info('XMTP client created successfully with ethers');
      setClient(xmtpClient);
      setIsConnected(true);
      
      // Load conversations
      await loadConversations();
      
      return true;
    } catch (error) {
      logger.error('Failed to connect to XMTP with ethers:', error);
      setConnectionError(error as Error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Try to connect with Wagmi if available - with protection against infinite loops
  useEffect(() => {
    const attemptWagmiConnection = async () => {
      // Only attempt connection if:
      // 1. User is connected with Wagmi
      // 2. We have a Wagmi address
      // 3. Not already connected to XMTP
      // 4. Not currently connecting
      // 5. Haven't attempted connection yet
      if (isWagmiConnected && 
          wagmiAddress && 
          !isConnected && 
          !isConnecting && 
          !connectionAttemptedRef.current) {
        
        logger.info('User is connected with Wagmi, attempting to connect to XMTP...');
        logger.debug('Connection status check:', {
          isWagmiConnected,
          wagmiAddress,
          isConnected,
          isConnecting,
          connectionAttempted: connectionAttemptedRef.current
        });
        
        // Mark that we've attempted connection
        connectionAttemptedRef.current = true;
        
        try {
          const wagmiSigner = await createWagmiSigner();
          if (wagmiSigner) {
            await connectXmtp(wagmiSigner);
            logger.info('Successfully connected to XMTP with Wagmi');
          } else {
            logger.error('Failed to create Wagmi signer');
            // Reset the flag after a failed attempt so we can try again later if needed
            connectionAttemptedRef.current = false;
          }
        } catch (error) {
          logger.error('Failed to connect to XMTP with Wagmi:', error);
          // Reset the flag after a failed attempt so we can try again later if needed
          connectionAttemptedRef.current = false;
        }
      } else {
        logger.debug('Skipping auto-connection with Wagmi:', {
          isWagmiConnected,
          hasWagmiAddress: !!wagmiAddress,
          isConnected,
          isConnecting,
          connectionAttempted: connectionAttemptedRef.current
        });
      }
    };
    
    attemptWagmiConnection();
  }, [isWagmiConnected, wagmiAddress, isConnected, isConnecting, createWagmiSigner]);

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
    if (wagmiAddress) {
      const address = wagmiAddress.toLowerCase();
      
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
      const conversation = await client.conversations.get(conversationId);
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

  // Check if we can message a list of addresses
  const canMessage = async (addresses: string[]) => {
    if (!client) {
      logger.error('Cannot check canMessage: No XMTP client available');
      throw new Error('No XMTP client available');
    }
    
    try {
      logger.info(`Checking canMessage for ${addresses.length} addresses`);
      const results = await client.canMessage(addresses);
      logger.info(`Completed canMessage check for ${addresses.length} addresses`);
      logger.debug('canMessage results:', results);
      
      return results;
    } catch (error) {
      logger.error('Error checking canMessage:', error);
      throw error;
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
      
      // Check if we can message this address
      const canMessageMap = await client.canMessage([address]);
      const canMessageAddress = canMessageMap.get(address);
      
      if (!canMessageAddress) {
        logger.warn(`Cannot message address ${address}: Not on XMTP network`);
        throw new Error(`Address ${address} is not on the XMTP network`);
      }
      
      // Try to find an existing conversation
      const existingConversations = await client.conversations.list();
      const existingConvo = existingConversations.find(
        (convo: any) => convo.peerAddress.toLowerCase() === address.toLowerCase()
      );
      
      if (existingConvo) {
        logger.info(`Found existing conversation with ${address}`);
        logger.debug('Existing conversation:', existingConvo);
        return existingConvo;
      }
      
      // Create a new conversation
      logger.info(`Creating new conversation with ${address}`);
      const newConvo = await client.conversations.newConversation(address);
      logger.info(`Created new conversation with ${address}`);
      logger.debug('New conversation:', newConvo);
      
      // Refresh conversations list
      await loadConversations();
      
      return newConvo;
    } catch (error) {
      logger.error(`Error getting or creating conversation with ${address}:`, error);
      throw error;
    }
  };

  // Provide context value
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
    getOrCreateConversation
  };

  return (
    <XmtpContext.Provider value={contextValue}>
      {children}
    </XmtpContext.Provider>
  );
};

export default XmtpProvider; 