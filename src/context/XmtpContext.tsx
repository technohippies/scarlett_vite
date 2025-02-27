import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
// Import directly from @xmtp/browser-sdk
import { Client } from '@xmtp/browser-sdk';
import { useAppKit } from './ReownContext';
import { XmtpContextType, Conversation } from '../types/chat';

// Create context
const XmtpContext = createContext<XmtpContextType | null>(null);

// Hook to use XMTP context
export const useXmtp = () => {
  const context = useContext(XmtpContext);
  if (!context) {
    console.warn('useXmtp must be used within an XmtpProvider');
    return null;
  }
  return context;
};

interface XmtpProviderProps {
  children: ReactNode;
}

export const XmtpProvider: React.FC<XmtpProviderProps> = ({ children }) => {
  const [client, setClient] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const appKit = useAppKit(); // Using the appKit hook

  // Check if appKit is connected and try to connect to XMTP automatically
  useEffect(() => {
    const checkAppKitAndConnectXmtp = async () => {
      if (!appKit) return;
      
      try {
        // Check if user is already connected to AppKit
        let address = null;
        
        // Try different methods to get the address
        if (typeof appKit.getAddress === 'function') {
          try {
            address = await appKit.getAddress();
            console.log('Auto-connect: Got address from appKit.getAddress():', address);
          } catch (error) {
            console.log('Auto-connect: Error getting address from appKit.getAddress():', error);
          }
        } 
        
        if (!address && appKit.getCaipAddress && typeof appKit.getCaipAddress === 'function') {
          try {
            const caipAddress = await appKit.getCaipAddress();
            console.log('Auto-connect: Got CAIP address:', caipAddress);
            if (caipAddress && typeof caipAddress === 'string') {
              const parts = caipAddress.split(':');
              if (parts.length === 3) {
                address = parts[2];
                console.log('Auto-connect: Extracted address from CAIP:', address);
              }
            }
          } catch (error) {
            console.log('Auto-connect: Error getting CAIP address:', error);
          }
        }
        
        if (address && !isConnected && !isConnecting) {
          console.log('User is connected to AppKit with address:', address);
          console.log('Attempting to auto-connect to XMTP...');
          
          // Get provider
          let provider = null;
          if (typeof appKit.getProvider === 'function') {
            try {
              provider = await appKit.getProvider();
              console.log('Auto-connect: Got provider from appKit.getProvider():', provider);
            } catch (error) {
              console.log('Auto-connect: Error getting provider from appKit.getProvider():', error);
            }
          } 
          
          if (!provider && appKit.universalProvider) {
            provider = appKit.universalProvider;
            console.log('Auto-connect: Using appKit.universalProvider:', provider);
          }
          
          // Fallback to window.ethereum if no provider is available
          if (!provider && typeof window !== 'undefined' && window.ethereum) {
            provider = window.ethereum;
            console.log('Auto-connect: Falling back to window.ethereum:', provider);
          }
          
          if (provider) {
            // Create a signer
            const signer = createSigner(address, provider);
            
            // Try to connect to XMTP
            try {
              await connectXmtp(signer);
            } catch (error) {
              console.error('Auto-connect to XMTP failed:', error);
            }
          }
        }
      } catch (error) {
        console.error('Error checking AppKit connection:', error);
      }
    };
    
    checkAppKitAndConnectXmtp();
  }, [appKit, isConnected, isConnecting]);

  // Helper function to create a signer
  const createSigner = (address: string, provider: any) => {
    return {
      walletType: "SCW" as const,
      getAddress: async () => address,
      signMessage: async (message: string) => {
        if (!provider) throw new Error('Provider not available');
        
        try {
          // Use the provider to sign the message
          console.log('Signing message with provider...');
          console.log('Message to sign:', message);
          console.log('Address used for signing:', address);
          
          // Ensure provider is connected first
          if (provider.connect && typeof provider.connect === 'function') {
            try {
              console.log('Connecting to provider before signing...');
              await provider.connect();
              console.log('Provider connected successfully');
            } catch (connectError) {
              console.warn('Could not connect to provider:', connectError);
              // Continue anyway, as some providers might not need explicit connection
            }
          }
          
          // Try different signing methods
          let signature;
          try {
            // Method 1: personal_sign with original message
            console.log('Attempting personal_sign...');
            signature = await provider.request({
              method: 'personal_sign',
              params: [message, address]
            });
          } catch (error) {
            console.error('Error with personal_sign, trying eth_sign:', error);
            
            try {
              // Method 2: eth_sign
              console.log('Attempting eth_sign...');
              signature = await provider.request({
                method: 'eth_sign',
                params: [address, message]
              });
            } catch (secondError) {
              console.error('Error with eth_sign, trying signMessage:', secondError);
              
              // Method 3: Try provider.signMessage if available
              if (provider.signMessage) {
                console.log('Attempting provider.signMessage...');
                signature = await provider.signMessage(message);
              } else if (typeof window !== 'undefined' && window.ethereum) {
                // Method 4: Try window.ethereum as fallback
                console.log('Attempting window.ethereum.request...');
                try {
                  signature = await (window.ethereum as any).request({
                    method: 'personal_sign',
                    params: [message, address]
                  });
                } catch (ethereumError) {
                  console.error('Error with window.ethereum.request:', ethereumError);
                  
                  // Method 5: Try ethers.js if available
                  if (typeof window !== 'undefined' && (window as any).ethers) {
                    console.log('Attempting ethers.js signing...');
                    try {
                      const ethers = (window as any).ethers;
                      const ethersProvider = new ethers.providers.Web3Provider(window.ethereum as any);
                      const ethersSigner = ethersProvider.getSigner(address);
                      signature = await ethersSigner.signMessage(message);
                    } catch (ethersError) {
                      console.error('Error with ethers.js signing:', ethersError);
                      throw new Error('All signing methods failed');
                    }
                  } else {
                    throw new Error('All signing methods failed');
                  }
                }
              } else {
                throw new Error('All signing methods failed');
              }
            }
          }
          
          console.log('Message signed successfully:', signature);
          return signature;
        } catch (error) {
          console.error('Error signing message:', error);
          throw error;
        }
      },
      // Add these methods for smart contract wallets
      getChainId: () => BigInt(84532), // Base Sepolia testnet
      getBlockNumber: () => BigInt(0)
    };
  };

  // Connect to XMTP
  const connectXmtp = async (signer: any) => {
    try {
      console.log("Starting XMTP connection process...");
      setIsConnecting(true);
      
      // Check if we already have a client
      if (client) {
        console.log("XMTP client already exists, using existing client");
        setIsConnected(true);
        setIsConnecting(false);
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
        throw new Error('Failed to get address from signer');
      }
      
      console.log('Creating XMTP client with signer');
      console.log('XMTP Client object available:', !!Client);
      console.log('XMTP Client.create method available:', !!(Client && typeof Client.create === 'function'));
      
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
        throw new Error('Invalid encryption key: must be exactly 32 bytes');
      }
      
      try {
        console.log('Attempting to create XMTP client with production environment...');
        
        // Use Client.create with encryption key and production environment
        const xmtpClient = await Client.create(signer, encryptionKey, { env: 'production' });
        console.log('XMTP client created successfully:', !!xmtpClient);
        
        setClient(xmtpClient);
        setIsConnected(true);
        
        // Load conversations
        await loadConversations();
      } catch (error) {
        console.error('Error creating XMTP client with production environment:', error);
        
        // Try with dev environment as fallback
        try {
          console.log('Attempting to create XMTP client with dev environment...');
          const xmtpClient = await Client.create(signer, encryptionKey, { env: 'dev' });
          console.log('XMTP client created successfully with dev environment:', !!xmtpClient);
          
          setClient(xmtpClient);
          setIsConnected(true);
          
          // Load conversations
          await loadConversations();
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
    }
  };

  // Disconnect from XMTP
  const disconnectXmtp = () => {
    setClient(null);
    setConversations([]);
    setIsConnected(false);
  };

  // Load conversations
  const loadConversations = async () => {
    try {
      if (!client) {
        console.warn("Cannot load conversations: XMTP client not available");
        return;
      }
      
      console.log("Loading conversations...");
      const convos = await client.conversations.list();
      setConversations(convos);
      console.log(`Loaded ${convos.length} conversations`);
    } catch (error) {
      console.error("Error loading conversations:", error);
    }
  };

  // Send a message
  const sendMessage = async (conversationId: string, message: string | object) => {
    if (!client) {
      console.warn('Cannot send message: No XMTP client');
      return;
    }
    
    try {
      // Find the conversation
      const conversation = await client.conversations.find(conversationId);
      if (!conversation) {
        throw new Error(`Conversation not found: ${conversationId}`);
      }
      
      // Send the message
      await conversation.send(message);
      
      // Reload conversations to get the updated messages
      await loadConversations();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  // Context value
  const contextValue: XmtpContextType = {
    client,
    conversations,
    isConnected,
    isConnecting,
    connectXmtp,
    disconnectXmtp,
    sendMessage,
    loadConversations
  };

  return (
    <XmtpContext.Provider value={contextValue}>
      {children}
    </XmtpContext.Provider>
  );
};

export default XmtpProvider; 