import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Client } from '@xmtp/browser-sdk';
import { useAppKit } from './ReownContext';
import { XmtpContextType, Conversation, ChatMessage } from '../types/chat';

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
  const appKit = useAppKit();

  // Check if we have a stored client
  useEffect(() => {
    const loadClient = async () => {
      try {
        // Check if we have keys in local storage
        const keys = localStorage.getItem('xmtp-keys');
        if (keys) {
          console.log('Found stored XMTP keys, attempting to restore client');
          setIsConnecting(true);
          
          // Create a client using stored keys
          const client = await Client.create(null, {
            env: 'production',
            privateKeyOverride: keys
          });
          
          setClient(client);
          setIsConnected(true);
          console.log('XMTP client restored successfully');
          
          // Load conversations
          await loadConversations(client);
        }
      } catch (error) {
        console.error('Failed to restore XMTP client:', error);
        // Clear potentially corrupted keys
        localStorage.removeItem('xmtp-keys');
      } finally {
        setIsConnecting(false);
      }
    };
    
    loadClient();
  }, []);

  // Connect to XMTP
  const connectXmtp = async (signer: any) => {
    try {
      console.log('Connecting to XMTP...');
      setIsConnecting(true);
      
      if (!signer) {
        console.error('No signer provided for XMTP connection');
        throw new Error('No signer provided');
      }
      
      console.log('Creating XMTP client with signer');
      const xmtpClient = await Client.create(signer, { env: 'production' });
      console.log('XMTP client created:', !!xmtpClient);
      
      // Save the keys for later restoration
      const keys = await xmtpClient.exportKeyBundle();
      localStorage.setItem('xmtp-keys', keys);
      
      setClient(xmtpClient);
      setIsConnected(true);
      
      // Load conversations
      await loadConversations(xmtpClient);
      
      return xmtpClient;
    } catch (error) {
      console.error('Error connecting to XMTP:', error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from XMTP
  const disconnectXmtp = () => {
    localStorage.removeItem('xmtp-keys');
    setClient(null);
    setConversations([]);
    setIsConnected(false);
  };

  // Load conversations
  const loadConversations = async (clientToUse = client) => {
    if (!clientToUse) {
      console.warn('Cannot load conversations: No XMTP client');
      return;
    }
    
    try {
      console.log('Loading XMTP conversations...');
      const convos = await clientToUse.conversations.list();
      console.log(`Found ${convos.length} conversations`);
      
      // Convert to our app's conversation format
      const formattedConversations: Conversation[] = await Promise.all(
        convos.map(async (convo: any) => {
          // Get messages for this conversation
          const messages = await convo.messages();
          
          // Format messages
          const formattedMessages: ChatMessage[] = messages.map((msg: any) => ({
            id: msg.id,
            sender: msg.senderAddress,
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
            timestamp: new Date(msg.sent),
            isBot: msg.senderAddress.toLowerCase() !== clientToUse.address.toLowerCase()
          }));
          
          return {
            id: convo.topic,
            messages: formattedMessages,
            topic: convo.context?.conversationId || 'New Conversation',
            lastMessageTimestamp: formattedMessages.length > 0 
              ? formattedMessages[formattedMessages.length - 1].timestamp 
              : new Date()
          };
        })
      );
      
      setConversations(formattedConversations);
    } catch (error) {
      console.error('Error loading conversations:', error);
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
    loadConversations: () => loadConversations()
  };

  return (
    <XmtpContext.Provider value={contextValue}>
      {children}
    </XmtpContext.Provider>
  );
};

export default XmtpProvider; 