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
          
          const signature = await provider.request({
            method: 'personal_sign',
            params: [message, address]
          });
          
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
      
      try {
        console.log('Attempting to create XMTP client with production environment...');
        
        // Use Client.create directly with production environment
        // @ts-ignore - Ignoring type errors for now to get it working
        const xmtpClient = await Client.create(signer, { env: 'production' });
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
          // @ts-ignore - Ignoring type errors for now to get it working
          const xmtpClient = await Client.create(signer, { env: 'dev' });
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