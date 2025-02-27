import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useCallback } from 'react';
// Import directly from @xmtp/browser-sdk
import { Client } from '@xmtp/browser-sdk';
import { useAppKit } from './ReownContext';
import { XmtpContextType, Conversation } from '../types/chat';
// Import Viem and Wagmi
import { useSignMessage, useAccount, useWalletClient } from 'wagmi';
// Import ethers for alternative implementation
import { ethers } from 'ethers';

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

interface XmtpProviderProps {
  children: ReactNode;
}

export const XmtpProvider: React.FC<XmtpProviderProps> = ({ children }) => {
  console.log('XmtpProvider initializing...');
  
  const [client, setClient] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const appKit = useAppKit(); // Using the appKit hook
  
  // Add a ref to track connection attempts
  const connectionAttemptedRef = useRef(false);
  const clientCreationInProgressRef = useRef(false);

  // Get Wagmi account and wallet client
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const { data: wagmiWalletClient } = useWalletClient();
  const { signMessageAsync } = useSignMessage();
  
  console.log('XmtpProvider state:', { 
    hasClient: !!client, 
    isConnected, 
    isConnecting, 
    wagmiAddress, 
    isWagmiConnected 
  });
  
  // Create a signer using Wagmi hooks with caching
  const createWagmiSigner = useCallback(() => {
    if (!wagmiAddress) {
      console.error('No Wagmi address available');
      return null;
    }
    
    console.log('Creating Wagmi signer for address:', wagmiAddress);
    
    return {
      walletType: "EOA" as const,
      getAddress: async () => {
        console.log('Wagmi signer getAddress called, returning:', wagmiAddress);
        return wagmiAddress;
      },
      signMessage: async (message: string) => {
        try {
          console.log('Signing message with Wagmi...');
          console.log('Message to sign:', message);
          
          // Check if we have a cached signature for this message
          const cacheKey = `${wagmiAddress.toLowerCase()}-${message}`;
          if (signatureCache.has(cacheKey)) {
            const cachedSignature = signatureCache.get(cacheKey);
            console.log('Using cached signature:', cachedSignature);
            return cachedSignature;
          }
          
          // Use Wagmi's signMessage hook
          console.log('Requesting new signature via Wagmi signMessageAsync...');
          let signature;
          try {
            signature = await signMessageAsync({ message });
            console.log('Successfully signed with Wagmi:', signature);
          } catch (signError: any) {
            console.error('Error during signature process:', {
              message: signError.message,
              name: signError.name,
              code: signError.code,
              stack: signError.stack
            });
            throw signError;
          }
          
          // Cache the signature
          signatureCache.set(cacheKey, signature);
          
          return signature;
        } catch (error) {
          console.error('Error signing with Wagmi:', error);
          throw error;
        }
      }
    };
  }, [wagmiAddress, signMessageAsync]);

  // Connect to XMTP with a more direct approach
  const connectXmtp = async (signer: any) => {
    try {
      console.log("Starting XMTP connection process...");
      
      // Prevent multiple simultaneous connection attempts
      if (clientCreationInProgressRef.current) {
        console.log("XMTP client creation already in progress, skipping");
        return;
      }
      
      setIsConnecting(true);
      clientCreationInProgressRef.current = true;
      
      // Check if we already have a client
      if (client) {
        console.log("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        clientCreationInProgressRef.current = false;
        return;
      }
      
      // Get the address from the signer for logging
      let address;
      try {
        address = await signer.getAddress();
        console.log('Signer address:', address);
      } catch (error) {
        console.error('Error getting address from signer:', error);
        setIsConnecting(false);
        clientCreationInProgressRef.current = false;
        throw new Error('Failed to get address from signer');
      }
      
      console.log('Creating XMTP client with signer');
      
      // Generate a random 32-byte encryption key for the local database
      // This should ideally be stored securely and reused for the same user
      const generateEncryptionKey = () => {
        // Create a new 32-byte array with random values
        return window.crypto.getRandomValues(new Uint8Array(32));
      };
      
      // Get or create encryption key
      // In a production app, you would want to store this key securely
      // and retrieve it for returning users
      const getEncryptionKey = (address: string) => {
        const storageKey = `xmtp-key-${address.toLowerCase()}`;
        let keyData = localStorage.getItem(storageKey);
        
        if (!keyData) {
          // No key found, generate a new one
          const newKey = generateEncryptionKey();
          // Convert to base64 for storage
          keyData = btoa(String.fromCharCode.apply(null, Array.from(newKey)));
          localStorage.setItem(storageKey, keyData);
          console.log('Generated and stored new encryption key');
        } else {
          console.log('Using existing encryption key from storage');
        }
        
        // Convert from base64 back to Uint8Array
        const keyBytes = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
        console.log('Encryption key byte length:', keyBytes.length);
        return keyBytes;
      };
      
      // Get encryption key for this user
      const encryptionKey = getEncryptionKey(address);
      console.log('Using encryption key for database:', !!encryptionKey);
      
      // Verify the encryption key is valid
      if (!encryptionKey || encryptionKey.length !== 32) {
        console.error('Invalid encryption key length:', encryptionKey ? encryptionKey.length : 'null');
        clientCreationInProgressRef.current = false;
        throw new Error('Invalid encryption key: must be exactly 32 bytes');
      }
      
      // Clear any cached data that might be causing issues
      console.log('Clearing any cached XMTP data for this address...');
      localStorage.removeItem(`xmtp-client-${address.toLowerCase()}`);
      
      // Clear all signature caches for this address
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(`xmtp-signature-${address.toLowerCase()}`)) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      console.log(`Cleared ${keysToRemove.length} cached signatures for address ${address}`);
      
      try {
        console.log('Attempting to create XMTP client with production environment...');
        
        // Use Client.create with encryption key and minimal options
        console.log('Creating XMTP client with minimal options to prevent signature loops');
        
        try {
          // Try with the most minimal options first
          console.log('Signer details:', {
            walletType: signer.walletType,
            hasGetAddress: typeof signer.getAddress === 'function',
            hasSignMessage: typeof signer.signMessage === 'function',
            hasGetChainId: typeof signer.getChainId === 'function'
          });
          
          const xmtpClient = await Client.create(signer, encryptionKey, { 
            env: 'dev'
          });
          console.log('XMTP client created successfully:', !!xmtpClient);
          
          setClient(xmtpClient);
          setIsConnected(true);
          
          // Load conversations
          await loadConversations();
        } catch (innerError: any) {
          console.error('Detailed error creating XMTP client:', {
            message: innerError.message,
            name: innerError.name,
            stack: innerError.stack,
            cause: innerError.cause ? {
              message: innerError.cause.message,
              name: innerError.cause.name
            } : 'No cause'
          });
          
          // Check for specific signature validation errors
          if (innerError.message && innerError.message.includes('Signature validation failed')) {
            console.error('Signature validation failed. This could be due to:');
            console.error('1. The wallet is a smart contract wallet (SCW) but not identified as such');
            console.error('2. The signature format is not compatible with XMTP verification');
            console.error('3. The wallet is using a non-standard signing method');
            
            // Log additional debugging information
            console.error('Wallet address:', address);
            console.error('Wallet type set as:', signer.walletType);
          }
          
          throw innerError;
        }
      } catch (error) {
        console.error('Error creating XMTP client with production environment:', error);
        
        // Try with dev environment as fallback
        try {
          console.log('Attempting to create XMTP client with dev environment...');
          
          // Use Client.create with encryption key and minimal options
          try {
            const xmtpClient = await Client.create(signer, encryptionKey, { 
              env: 'dev'
            });
            console.log('XMTP client created successfully with dev environment:', !!xmtpClient);
            
            setClient(xmtpClient);
            setIsConnected(true);
            
            // Load conversations
            await loadConversations();
          } catch (innerError: any) {
            console.error('Detailed error creating XMTP client with dev environment:', {
              message: innerError.message,
              name: innerError.name,
              stack: innerError.stack,
              cause: innerError.cause ? {
                message: innerError.cause.message,
                name: innerError.cause.name
              } : 'No cause'
            });
            
            // Check for specific signature validation errors
            if (innerError.message && innerError.message.includes('Signature validation failed')) {
              console.error('Signature validation failed in dev environment. This could be due to:');
              console.error('1. The wallet is a smart contract wallet (SCW) but not identified as such');
              console.error('2. The signature format is not compatible with XMTP verification');
              console.error('3. The wallet is using a non-standard signing method');
              
              // Log additional debugging information
              console.error('Wallet address:', address);
              console.error('Wallet type set as:', signer.walletType);
            }
            
            throw innerError;
          }
        } catch (fallbackError) {
          console.error('Error creating XMTP client with dev environment:', fallbackError);
          throw fallbackError;
        }
      }
    } catch (error) {
      console.error('Error connecting to XMTP:', error);
      throw error;
    } finally {
      setIsConnecting(false);
      clientCreationInProgressRef.current = false;
    }
  };

  // Function to directly connect using Wagmi
  const connectWithWagmi = async () => {
    if (!wagmiAddress) {
      console.error('Cannot connect to XMTP: No Wagmi address available');
      throw new Error('No Wagmi address available');
    }
    
    console.log('Connecting to XMTP with Wagmi...');
    setIsConnecting(true);
    
    try {
      // Check if we already have a client
      if (client) {
        console.log("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        return true;
      }
      
      // Check if we have a cached client for this address
      const cachedClientKey = `xmtp-client-${wagmiAddress.toLowerCase()}`;
      const cachedClientData = localStorage.getItem(cachedClientKey);
      
      if (cachedClientData) {
        console.log('Found cached XMTP client data for address:', wagmiAddress);
      }
      
      const wagmiSigner = createWagmiSigner();
      if (!wagmiSigner) {
        throw new Error('Failed to create Wagmi signer');
      }
      
      // Mark that we've attempted connection
      connectionAttemptedRef.current = true;
      
      // Create a more robust signer with detailed logging
      console.log('Creating Wagmi signer with address:', wagmiAddress);
      console.log('Wagmi wallet client available:', !!wagmiWalletClient);
      
      await connectXmtp(wagmiSigner);
      console.log('Successfully connected to XMTP with Wagmi');
      return true;
    } catch (error) {
      console.error('Failed to connect to XMTP with Wagmi:', error);
      // Reset connection attempt flag to allow retrying
      connectionAttemptedRef.current = false;
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Try to connect with ethers.js as an alternative
  const connectWithEthers = async () => {
    if (!wagmiAddress) {
      console.error('Cannot connect to XMTP: No Wagmi address available');
      throw new Error('No Wagmi address available');
    }
    
    console.log('Attempting to connect to XMTP with ethers.js...');
    setIsConnecting(true);
    
    try {
      // Check if we already have a client
      if (client) {
        console.log("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
        return true;
      }
      
      // Check if window.ethereum is available
      if (!window.ethereum) {
        throw new Error('No ethereum provider found. Please install a wallet.');
      }
      
      // Create an ethers provider with proper type assertion
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      console.log('Created ethers provider:', !!provider);
      
      // Get the signer
      const ethersSigner = await provider.getSigner();
      console.log('Got ethers signer with address:', await ethersSigner.getAddress());
      
      // Create a signer adapter for XMTP
      const xmtpEthersSigner = {
        walletType: "EOA" as const,
        getAddress: async () => {
          return await ethersSigner.getAddress();
        },
        signMessage: async (message: string) => {
          console.log('Signing message with ethers:', message);
          // Convert the string signature to Uint8Array as required by XMTP
          const signature = await ethersSigner.signMessage(message);
          // Convert hex string to Uint8Array
          return ethers.getBytes(signature);
        },
        getChainId: async () => {
          const network = await provider.getNetwork();
          return Number(network.chainId);
        }
      };
      
      // Generate a random encryption key
      const encryptionKey = window.crypto.getRandomValues(new Uint8Array(32));
      
      // Create the XMTP client
      console.log('Creating XMTP client with ethers signer...');
      const xmtpClient = await Client.create(xmtpEthersSigner, encryptionKey, {
        env: 'dev'
      });
      
      console.log('XMTP client created successfully with ethers:', !!xmtpClient);
      setClient(xmtpClient);
      setIsConnected(true);
      
      // Load conversations
      await loadConversations();
      
      return true;
    } catch (error) {
      console.error('Failed to connect to XMTP with ethers:', error);
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
        
        console.log('User is connected with Wagmi, attempting to connect to XMTP...');
        console.log('Connection status check:', {
          isWagmiConnected,
          wagmiAddress,
          isConnected,
          isConnecting,
          connectionAttempted: connectionAttemptedRef.current
        });
        
        // Mark that we've attempted connection
        connectionAttemptedRef.current = true;
        
        try {
          // Check if we have a cached client for this address
          const cachedClientKey = `xmtp-client-${wagmiAddress.toLowerCase()}`;
          const cachedClientData = localStorage.getItem(cachedClientKey);
          
          if (cachedClientData) {
            console.log('Found cached XMTP client data for address:', wagmiAddress);
          }
          
          const wagmiSigner = createWagmiSigner();
          if (wagmiSigner) {
            await connectXmtp(wagmiSigner);
            console.log('Successfully connected to XMTP with Wagmi');
          } else {
            console.error('Failed to create Wagmi signer');
            // Reset the flag after a failed attempt so we can try again later if needed
            connectionAttemptedRef.current = false;
          }
        } catch (error) {
          console.error('Failed to connect to XMTP with Wagmi:', error);
          // Reset the flag after a failed attempt so we can try again later if needed
          connectionAttemptedRef.current = false;
        }
      } else {
        console.log('Skipping auto-connection with Wagmi:', {
          isWagmiConnected,
          hasWagmiAddress: !!wagmiAddress,
          isConnected,
          isConnecting,
          connectionAttempted: connectionAttemptedRef.current
        });
      }
    };
    
    attemptWagmiConnection();
  }, [isWagmiConnected, wagmiAddress, isConnected, isConnecting]);

  // Disconnect from XMTP
  const disconnectXmtp = () => {
    setClient(null);
    setConversations([]);
    setIsConnected(false);
  };

  // Clear cached XMTP data and reset connection
  const resetXmtpConnection = () => {
    console.log('Resetting XMTP connection and clearing cached data...');
    
    // Disconnect current client
    disconnectXmtp();
    
    // Reset connection attempt flag
    connectionAttemptedRef.current = false;
    
    // Clear cached data for the current address
    if (wagmiAddress) {
      const address = wagmiAddress.toLowerCase();
      
      // Clear client cache
      localStorage.removeItem(`xmtp-client-${address}`);
      
      // Clear encryption key
      localStorage.removeItem(`xmtp-key-${address}`);
      
      // Clear all signature caches (this will clear all signatures for all addresses)
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('xmtp-signature-')) {
          keysToRemove.push(key);
        }
      }
      
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      console.log(`Cleared ${keysToRemove.length} cached signatures and client data for address ${address}`);
    }
  };

  // Load conversations
  const loadConversations = async () => {
    try {
      if (!client) {
        console.warn("Cannot load conversations: XMTP client not available");
        return;
      }
      
      console.log("Loading conversations...");
      const xmtpConvos = await client.conversations.list();
      console.log(`Loaded ${xmtpConvos.length} conversations from XMTP`);
      
      // Map XMTP conversations to our Conversation type
      const mappedConvos: Conversation[] = await Promise.all(
        xmtpConvos.map(async (convo: any) => {
          try {
            // Get messages for this conversation
            const messages = await convo.messages();
            console.log(`Loaded ${messages.length} messages for conversation with ${convo.peerAddress}`);
            
            // Map messages to our ChatMessage type
            const chatMessages = messages.map((msg: any) => ({
              id: msg.id,
              sender: msg.senderAddress,
              content: msg.content,
              timestamp: msg.sent,
              isBot: false // Assuming all XMTP messages are from humans
            }));
            
            return {
              id: convo.peerAddress, // Using peer address as conversation ID
              messages: chatMessages,
              topic: convo.context?.conversationId || undefined,
              lastMessageTimestamp: chatMessages.length > 0 
                ? chatMessages[chatMessages.length - 1].timestamp 
                : new Date()
            };
          } catch (error) {
            console.error(`Error loading messages for conversation with ${convo.peerAddress}:`, error);
            return {
              id: convo.peerAddress,
              messages: [],
              lastMessageTimestamp: new Date()
            };
          }
        })
      );
      
      setConversations(mappedConvos);
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  // Send a message
  const sendMessage = async (conversationId: string, message: string | object) => {
    if (!client) {
      console.warn('Cannot send message: No XMTP client');
      throw new Error('Cannot send message: XMTP client not initialized. Please connect to XMTP first.');
    }
    
    try {
      console.log(`Sending message to ${conversationId}:`, message);
      
      // Skip the canMessage check since it might be giving false negatives
      // and directly try to create a conversation
      
      // Find or create conversation with the peer
      let conversation;
      try {
        // Try to find existing conversation first
        conversation = await client.conversations.find(conversationId);
        console.log('Found existing conversation');
      } catch (error) {
        // If not found, create a new conversation
        console.log('Creating new conversation with:', conversationId);
        // For @xmtp/browser-sdk version 0.0.21, we need to use newDm instead of newConversation
        try {
          conversation = await client.conversations.newDm(conversationId);
          console.log('New conversation created successfully');
        } catch (convError: any) {
          console.error('Error creating new conversation:', convError);
          throw new Error(`Failed to create conversation with ${conversationId}: ${convError.message}`);
        }
      }
      
      if (!conversation) {
        throw new Error(`Could not create or find conversation with: ${conversationId}`);
      }
      
      // Send the message
      const sentMessage = await conversation.send(message);
      console.log('Message sent successfully:', sentMessage);
      
      // Reload conversations to get the updated messages
      await loadConversations();
      
      return sentMessage;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  // Check if an address can be messaged
  const canMessage = async (addresses: string[]): Promise<Map<string, boolean>> => {
    try {
      if (!client) {
        console.warn('Cannot check if address can be messaged: No XMTP client');
        return new Map();
      }
      
      const results = new Map<string, boolean>();
      
      // First try the static method
      try {
        const staticResults = await Client.canMessage(addresses, 'dev');
        // Copy results from static method
        for (const [address, canMsg] of staticResults.entries()) {
          results.set(address, canMsg);
        }
      } catch (error) {
        console.error('Error using static canMessage method:', error);
      }
      
      // For each address, also try to create a conversation as a more reliable check
      for (const address of addresses) {
        try {
          // Try to find or create a conversation
          try {
            await client.conversations.find(address);
            // If we get here, the conversation exists
            results.set(address, true);
          } catch (error) {
            // If not found, try to create a new conversation
            try {
              await client.conversations.newDm(address);
              // If we get here, we can message this address
              results.set(address, true);
            } catch (error) {
              // If we can't create a conversation, set to false
              if (!results.has(address)) {
                results.set(address, false);
              }
            }
          }
        } catch (error) {
          console.error(`Error checking if address ${address} can be messaged:`, error);
          // Only set to false if we don't already have a result
          if (!results.has(address)) {
            results.set(address, false);
          }
        }
      }
      
      return results;
    } catch (error) {
      console.error('Error checking if address can be messaged:', error);
      return new Map();
    }
  };

  // Context value
  const contextValue: XmtpContextType = {
    client,
    conversations,
    isConnected,
    isConnecting,
    connectXmtp,
    connectWithWagmi,
    connectWithEthers,
    disconnectXmtp,
    resetXmtpConnection,
    sendMessage,
    loadConversations,
    canMessage
  };

  console.log('XmtpProvider rendering with context:', { 
    hasClient: !!contextValue.client,
    isConnected: contextValue.isConnected,
    isConnecting: contextValue.isConnecting
  });

  return (
    <XmtpContext.Provider value={contextValue}>
      {children}
    </XmtpContext.Provider>
  );
};

export default XmtpProvider; 