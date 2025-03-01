import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft } from '@phosphor-icons/react';
// import { Gear } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';

// Simple date formatter function to prevent Invalid Date issues
const formatMessageTime = (timestamp: Date) => {
  if (!timestamp || isNaN(timestamp.getTime())) {
    return 'Unknown time';
  }
  
  const now = new Date();
  const diffMs = now.getTime() - timestamp.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffMins < 1440) {
    const hours = Math.floor(diffMins / 60);
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }
  
  return timestamp.toLocaleDateString();
};

// Helper function to determine if a message is from the bot
const isBotMessage = (message: any, ourWalletAddress?: string): boolean => {
  // Check if the message has explicit bot flag
  if (message.isBot === true) {
    return true;
  }
  
  // If we have the sender address and our wallet address, compare them
  if (message.senderAddress && ourWalletAddress) {
    return message.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase();
  }
  
  // If the message has a direction, use that
  if (message.direction === 'received') {
    return true;
  }
  
  // If the message has a sender field, use that
  if (message.sender === 'bot') {
    return true;
  }
  
  // Default to false if we can't determine
  return false;
};

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const xmtp = useXmtp();
  const appKit = useAppKit();
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [botConversation, setBotConversation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isReownConnected, setIsReownConnected] = useState(false);
  const [reownSigner, setReownSigner] = useState<any>(null);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  
  // Check if user is connected to Reown on mount
  useEffect(() => {
    const checkReownConnection = async () => {
      if (!appKit) return;
      
      try {
        console.log('Checking Reown connection status with appKit:', appKit);
        
        // Check if we have an address and signer directly from appKit
        // Use type assertion to access properties
        const appKitAny = appKit as any;
        
        if (appKitAny.address && appKitAny.ethersSigner) {
          console.log('User is connected to Reown with address:', appKitAny.address);
          setIsReownConnected(true);
          setReownSigner(appKitAny.ethersSigner);
          return;
        }
        
        // Fallback to previous approach if the direct properties aren't available
        let signer = null;
        
        // Try to get the signer from AppKit using type assertion
        if (appKitAny.getSigner && typeof appKitAny.getSigner === 'function') {
          console.log('Getting signer from appKit.getSigner()');
          signer = await appKitAny.getSigner();
        } else if (appKitAny.getProvider && typeof appKitAny.getProvider === 'function') {
          console.log('Getting provider from appKit.getProvider()');
          const provider = await appKitAny.getProvider();
          if (provider && provider.getSigner) {
            signer = provider.getSigner();
          }
        } else if (appKitAny.connectWallet && typeof appKitAny.connectWallet === 'function') {
          // If we have a connectWallet function but no signer yet, check if we're already connected
          console.log('Checking if already connected via appKit.isConnected');
          if (appKitAny.isConnected) {
            console.log('User is already connected according to appKit.isConnected');
            setIsReownConnected(true);
            // Try to get the signer
            try {
              signer = await appKitAny.connectWallet();
              setReownSigner(signer);
            } catch (err) {
              console.warn('Could not get signer from already connected wallet:', err);
            }
            return;
          }
        }
        
        if (signer) {
          console.log('User is connected to Reown with signer');
          setIsReownConnected(true);
          setReownSigner(signer);
        } else {
          console.log('User is not connected to Reown (no signer found)');
          setIsReownConnected(false);
          setReownSigner(null);
        }
      } catch (error) {
        console.error('Error checking Reown connection:', error);
        setIsReownConnected(false);
        setReownSigner(null);
      }
    };
    
    checkReownConnection();
  }, [appKit]);
  
  // Check XMTP connection status and load the bot conversation
  useEffect(() => {
    if (xmtp?.isConnected && xmtp.client) {
      console.log('XMTP connected, loading bot conversation');
      loadBotConversation();
    }
  }, [xmtp?.isConnected]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Function to get or create the bot conversation
  const loadBotConversation = async () => {
    if (!xmtp || !xmtp.client) {
      console.log('XMTP not connected, cannot load bot conversation');
      return;
    }
    
    try {
      setSendStatus('Loading conversation with Scarlett bot...');
      
      // Get our wallet address and inbox ID for comparison
      // Use type assertion for client - the XMTP Client type doesn't expose address directly in TypeScript
      // but it is available at runtime
      const xmtpClient = xmtp.client as any;
      let walletAddress = '';
      
      try {
        // Try to get the address from the client
        walletAddress = await xmtpClient.address;
        console.log('Our wallet address:', walletAddress);
      } catch (error) {
        console.warn('Could not get wallet address from XMTP client:', error);
      }
      
      // Try to get our inbox ID from the client if available
      let ourInboxId = null;
      try {
        // This is a guess at the property name - may need adjustment based on actual SDK
        if (xmtpClient.inboxId) {
          ourInboxId = xmtpClient.inboxId;
          console.log('Our inbox ID:', ourInboxId);
        }
      } catch (error) {
        console.log('Could not get our inbox ID:', error);
      }
      
      // Use the createBotConversation method to ensure we always use the same conversation
      const conversation = await xmtp.createBotConversation();
      console.log('Got conversation with Scarlett bot:', conversation);
      
      // Try to get the bot's inbox ID from the conversation if available
      let botInboxId = null;
      try {
        // These are guesses at property names - may need adjustment based on actual SDK
        if (conversation.peerInboxId) {
          botInboxId = conversation.peerInboxId;
          console.log('Bot inbox ID:', botInboxId);
        } else if (conversation.topic && conversation.topic.includes('inbox')) {
          // Some implementations might encode the inbox ID in the topic
          console.log('Conversation topic:', conversation.topic);
        }
      } catch (error) {
        console.log('Could not get bot inbox ID:', error);
      }
      
      setBotConversation(conversation);
      
      // Load messages from this conversation
      try {
        const messages = await conversation.messages();
        console.log(`Loaded ${messages.length} messages from conversation`);
        
        // Create a local array to accumulate formatted messages
        const processedMessages: any[] = [];
        
        // Map messages to our format with enhanced logging
        const formattedMessages = messages.map((msg: any) => {
          try {
            // Log full message object for debugging
            console.log('Processing message:', {
          id: msg.id,
          content: msg.content,
              senderAddress: msg.senderAddress,
              recipientAddress: msg.recipientAddress,
              sent: msg.sent,
              messageVersion: msg.messageVersion,
              contentTopic: msg.contentTopic,
              direction: msg.direction,
              // Add any XMTP v3 specific fields we can find
              senderInboxId: msg.senderInboxId,
              recipientInboxId: msg.recipientInboxId
            });
            
            // Enhance the message with our inbox ID if available
            if (ourInboxId) {
              msg.ourInboxId = ourInboxId;
            }
            
            // For XMTP v3, determine if this is a message we sent or received
            // If we don't have direction information, try to infer it
            if (!msg.direction) {
              // In XMTP v3, we can sometimes determine direction by comparing inbox IDs
              if (msg.senderInboxId && ourInboxId) {
                msg.direction = msg.senderInboxId === ourInboxId ? 'sent' : 'received';
                console.log(`Inferred message direction: ${msg.direction} based on inbox ID comparison`);
              }
            }
            
            // Use the helper function to determine if message is from bot
            // Pass the accumulated messages so far for context
            const isFromBot = isBotMessage(msg, walletAddress);
            
            const formattedMessage = {
              id: msg.id || Date.now().toString(),
              content: typeof msg.content === 'object' ? JSON.stringify(msg.content) : msg.content,
              sender: isFromBot ? 'bot' : 'user',
              timestamp: new Date(msg.sent || Date.now())
            };
            
            // Add this formatted message to our accumulator for context in future messages
            processedMessages.push(formattedMessage);
            
            console.log('Formatted message:', formattedMessage);
            return formattedMessage;
          } catch (msgError) {
            console.error('Error formatting message:', msgError, msg);
            // Return a fallback message object
            return {
              id: msg.id || Date.now().toString(),
              content: typeof msg.content === 'string' ? msg.content : 'Error displaying message content',
              sender: 'user', // Default to user if we can't determine
              timestamp: new Date()
            };
          }
        });
        
        // Show all messages
        setChatMessages(formattedMessages);
        setSendStatus(null);
      } catch (messagesError) {
        console.error('Error loading messages:', messagesError);
        setChatMessages([]);
        setSendStatus('Connected to bot, but could not load previous messages');
      }
    } catch (error) {
      console.error('Error loading bot conversation:', error);
      setSendStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Add a message listener to the conversation
  useEffect(() => {
    if (botConversation) {
      console.log('Setting up message stream for bot conversation');
      
      let cleanup: (() => void) | null = null;
      
      // Get our wallet address and inbox ID for comparison
      const getWalletAddress = async () => {
        if (xmtp?.client) {
          return await (xmtp.client as any).address;
        }
        return null;
      };
      
      // Try to get our inbox ID
      const getOurInboxId = async () => {
        if (xmtp?.client && xmtp.client.inboxId) {
          return xmtp.client.inboxId;
        }
        return null;
      };
      
      // Create a stream of messages
      try {
        // Use the stream method instead of streamMessages
        const stream = botConversation.stream(async (error: Error | null, message: any) => {
          if (error) {
            console.error('Error in message stream:', error);
            return;
          }
          
          if (!message) {
            console.log('No message received from stream');
            return;
          }
          
          // Log the raw message with any XMTP v3 specific fields we can find
          console.log('New message received:', {
            id: message.id,
            content: message.content,
            senderAddress: message.senderAddress,
            recipientAddress: message.recipientAddress,
            sent: message.sent,
            messageVersion: message.messageVersion,
            contentTopic: message.contentTopic,
            direction: message.direction,
            conversationId: message.conversationId,
            // Add any XMTP v3 specific fields
            senderInboxId: message.senderInboxId,
            recipientInboxId: message.recipientInboxId,
            // Add timestamp for debugging
            receivedAt: new Date().toISOString()
          });
          
          // Get our wallet address and inbox ID
          const walletAddress = await getWalletAddress();
          console.log('Our wallet address for stream message:', walletAddress);
          
          const ourInboxId = await getOurInboxId();
          if (ourInboxId) {
            message.ourInboxId = ourInboxId;
            console.log('Our inbox ID for stream message:', ourInboxId);
          }
          
          // For XMTP v3, we need to determine if this is a message we sent or received
          // If we don't have direction information, try to infer it
          if (!message.direction) {
            // In XMTP v3, we can sometimes determine direction by comparing inbox IDs
            if (message.senderInboxId && ourInboxId) {
              message.direction = message.senderInboxId === ourInboxId ? 'sent' : 'received';
              console.log(`Inferred message direction: ${message.direction} based on inbox ID comparison`);
            }
          }
          
          // Only add the message if it's not already in the chat
          setChatMessages(prev => {
            // Check if this message already exists in our chat by ID
            const messageExists = prev.some(msg => msg.id === message.id);
            
            // For user messages coming from the stream, we need to be extra careful about duplicates
            const isFromBot = isBotMessage(message, walletAddress);
            
            // If this is a user message, check for duplicates by content
            if (!isFromBot && !messageExists) {
              // Check if this message content matches any recent user message
              const recentUserMessageWithSameContent = prev.find(msg => 
                msg.sender === 'user' && 
                msg.content === message.content &&
                // Only consider messages sent in the last 30 seconds as potential duplicates
                (new Date().getTime() - msg.timestamp.getTime() < 30000)
              );
              
              if (recentUserMessageWithSameContent) {
                console.log('Detected duplicate user message, skipping:', {
                  streamMessage: message.content,
                  existingMessage: recentUserMessageWithSameContent
                });
                return prev; // Don't add this message
              }
            }
            
            console.log('Message exists check:', {
              messageContent: message.content,
              exists: messageExists,
              isFromBot,
              prevMessages: prev.map(m => ({id: m.id, content: m.content.substring(0, 20) + '...', sender: m.sender}))
            });
            
            if (!messageExists) {
              const formattedMessage = {
                id: message.id || Date.now().toString(),
                content: typeof message.content === 'object' ? JSON.stringify(message.content) : message.content,
                sender: isFromBot ? 'bot' : 'user',
                timestamp: new Date(message.sent || Date.now()),
                fromStream: true // Flag to indicate this message came from the stream
              };
              
              console.log('Formatted message:', formattedMessage);
              
              // Add the new message to the chat
              return [...prev, formattedMessage];
            }
            
            return prev;
          });
        });
        
        cleanup = () => {
          console.log('Cleaning up message stream');
          if (stream && typeof stream.unsubscribe === 'function') {
            stream.unsubscribe();
          }
        };
      } catch (error) {
        console.error('Error creating message stream:', error);
      }
      
      // Clean up function will be called when component unmounts or conversation changes
      return () => {
        if (cleanup) {
          cleanup();
        }
      };
    }
  }, [botConversation]);
  
  // Function to send a message to the bot
  const sendMessageToBot = async (messageContent: string) => {
    if (!xmtp || !xmtp.client) {
      setSendStatus('Please connect to XMTP first');
      return;
    }
    
    if (!messageContent.trim()) {
      return;
    }
    
    try {
      setSendStatus('Sending message...');
      
      // Use the createBotConversation method to ensure we always use the same conversation
      let conversation;
      try {
        conversation = await xmtp.createBotConversation();
        setBotConversation(conversation);
      } catch (error: any) {
        console.error('Error getting or creating conversation:', error);
        setSendStatus(`Error: ${error.message}`);
        return;
      }
      
      if (conversation) {
        // Generate a client-side ID for this message to prevent duplicates
        const clientGeneratedId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Add the message to the local chat immediately for better UX
        const newMessage = {
          id: clientGeneratedId, // Use our client-generated ID
          clientGeneratedId, // Store this for later comparison
          content: messageContent,
          sender: 'user', // Always user for messages we send
          timestamp: new Date(),
          isBot: false,
          direction: 'sent' // Explicitly mark as sent
        };
        
        setChatMessages(prev => {
          // Check if this message already exists in our chat
          const messageExists = prev.some(msg => 
            msg.content === messageContent && 
            msg.sender === 'user' &&
            // Only consider messages sent in the last 5 seconds as potential duplicates
            (new Date().getTime() - msg.timestamp.getTime() < 5000)
          );
          
          if (messageExists) {
            console.log('Message already exists in chat, not adding duplicate');
            return prev;
          }
          
          return [...prev, newMessage];
        });
        
        // Send the message
        await conversation.send(messageContent);
        console.log('Message sent successfully!');
        setSendStatus(null);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setSendStatus(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  const handleSendMessage = async (messageContent: string) => {
    if (!messageContent.trim()) return;
    
    // Send the message to the bot
    await sendMessageToBot(messageContent);
  };
  
  // Connect to Reown only (first step)
  const handleConnectReown = async () => {
    console.log('Connecting to Reown...');
    setConnectionError(null);
    
    try {
      // Use the appKit instance that was already obtained at the component level
      if (!appKit || !appKit.connectWallet) {
        throw new Error('AppKit not initialized or connectWallet not available');
      }
      
      // Call the connectWallet function from our context
      const signer = await appKit.connectWallet();
      
      if (!signer) {
        throw new Error('Failed to connect to Reown');
      }
      
      console.log('Successfully connected to Reown');
      setIsReownConnected(true);
      setReownSigner(signer);
      return signer;
    } catch (error) {
      console.error('Error connecting to Reown:', error);
      setConnectionError(error instanceof Error ? error : new Error(String(error)));
      setIsReownConnected(false);
      return null;
    }
  };
  
  // Connect to XMTP explicitly (second step)
  const handleConnectXmtp = async () => {
    if (!isReownConnected || !reownSigner) {
      console.error('Cannot connect to XMTP: Not connected to Reown');
      setConnectionError(new Error('Please connect to Reown first'));
      return;
    }
    
    if (!xmtp) {
      console.error('XMTP context is not available');
      setConnectionError(new Error('XMTP context is not available'));
      return;
    }
    
    try {
      console.log('Connecting to XMTP with signer:', reownSigner);
      
      // Use the connectXmtp method which is available on the context
      await xmtp.connectXmtp(reownSigner);
      
      // Check if we're connected
      if (xmtp.client) {
        console.log('Connected to XMTP!');
        
        // Get our wallet address for logging - use type assertion
        // The XMTP Client type doesn't expose address directly in TypeScript
        // but it is available at runtime
        const xmtpClient = xmtp.client as any;
        let walletAddress = '';
        
        try {
          walletAddress = await xmtpClient.address;
          console.log('Connected with wallet address:', walletAddress);
        } catch (error) {
          console.warn('Could not get wallet address from XMTP client:', error);
        }
        
        // Load or create conversation with the bot
        await loadBotConversation();
      } else {
        console.error('Failed to connect to XMTP: No client after connect');
        setConnectionError(new Error('Failed to connect to XMTP'));
      }
    } catch (error) {
      console.error('Error connecting to XMTP:', error);
      setConnectionError(error instanceof Error ? error : new Error(String(error)));
    }
  };
  
  if (!xmtp?.isConnected) {
    return (
      <div className="container mx-auto px-4 py-6">
        {/* Page header with back button */}
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink="/"
          title={t('chat.title')}
          // Gear icon for settings page will be implemented later
          // rightIcon={<Gear size={24} />}
        />
        
        <div className="bg-neutral-800 rounded-lg shadow-md border border-neutral-700 p-8 max-w-md w-full text-center mx-auto">
          <h2 className="text-xl font-bold mb-4">{t('chat.connectXmtp')}</h2>
          <p className="text-neutral-300 mb-6">
            {t('chat.connectXmtpDescription')}
          </p>
          
          {!isReownConnected ? (
            <button 
              onClick={handleConnectReown}
              className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium w-full mb-4"
            >
              Step 1: Connect Wallet with Reown
            </button>
          ) : (
            <>
              <div className="flex items-center justify-center mb-4 text-green-500">
                <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                <span>Wallet Connected</span>
              </div>
              
              <button 
                onClick={handleConnectXmtp}
                className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium w-full"
              >
                Step 2: Connect to XMTP Messaging
              </button>
            </>
          )}
          
          {connectionError && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-lg text-red-400 text-sm">
              <p className="font-medium">Connection Error:</p>
              <p>{connectionError.message}</p>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6 flex flex-col h-full">
      {/* Page header with back button */}
      <PageHeader
        leftIcon={<CaretLeft size={24} />}
        leftLink="/"
        title={t('chat.title')}
        // Gear icon for settings page will be implemented later
        // rightIcon={<Gear size={24} />}
      />
      
      {/* Chat container */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Messages container */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.map(msg => (
                    <div 
                      key={msg.id} 
              className={`flex ${msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div 
                        className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  msg.sender === 'bot' 
                    ? 'bg-neutral-700 text-white' 
                            : 'bg-indigo-600 text-white'
                        }`}
                      >
                        <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                  {formatMessageTime(msg.timestamp)}
                        </p>
                      </div>
                    </div>
                  ))}

          {sendStatus && (
            <div className={`p-2 rounded ${sendStatus.includes('Error') ? 'bg-red-900/20 text-red-400' : 'bg-blue-900/20 text-blue-400'}`}>
              {sendStatus}
                    </div>
                  )}
          
          <div ref={messagesEndRef} />
                </div>
                
        {/* Chat input */}
        <div className="border-neutral-700 bg-neutral-900">
                <ChatInput 
                  onSendMessage={handleSendMessage} 
                  placeholder={t('chat.placeholder')}
                />
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 