import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllSongs } from '../../hooks/useSongs';
import { ArrowRight } from '@phosphor-icons/react';
import { ipfsCidToUrl } from '../../lib/tableland/client';
import { useXmtp } from '../../context/XmtpContext';
import { SCARLETT_BOT_ADDRESS } from '../../lib/constants';

// Number of messages to show initially
const INITIAL_MESSAGE_COUNT = 3;

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
  
  const days = Math.floor(diffMins / 1440);
  if (days < 7) {
    return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  }
  
  // For older messages, show the actual date
  return timestamp.toLocaleDateString();
};

// Add a helper function to identify bot messages
const isBotMessage = (message: any, ourWalletAddress?: string, previousMessages?: any[]): boolean => {
  console.log('Checking if message is from bot with our address:', ourWalletAddress);
  
  // First check if we have direction information
  if (message.direction === 'received') {
    console.log('Message is from bot (direction: received)');
    return true; // Messages received are from the bot
  }
  
  if (message.direction === 'sent') {
    console.log('Message is from user (direction: sent)');
    return false; // Messages sent are from the user
  }
  
  // Check for XMTP v3 specific fields
  if (message.senderInboxId) {
    // Known bot inbox ID from logs
    const BOT_INBOX_ID = '460e9b4204ba118295c86606a37cfd4413fafec90d90d4631f8526f23638cc8d';
    
    // In XMTP v3, we can compare inbox IDs
    const isBotInboxId = message.senderInboxId === BOT_INBOX_ID;
    if (isBotInboxId) {
      console.log('Message is from bot (inbox ID matches bot)');
      return true;
    }
    
    // If we have our inbox ID, check if the sender is us
    if (message.ourInboxId && message.senderInboxId === message.ourInboxId) {
      console.log('Message is from user (inbox ID matches our inbox)');
      return false;
    }
  }
  
  // If we have sender address, check if it matches the bot address
  if (message.senderAddress) {
    const senderMatches = message.senderAddress.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase();
    if (senderMatches) {
      console.log('Message is from bot (sender address matches)');
      return true;
    }
    
    // If we have our wallet address, check if the sender is us
    if (ourWalletAddress && message.senderAddress.toLowerCase() === ourWalletAddress.toLowerCase()) {
      console.log('Message is from user (sender address matches our wallet)');
      return false;
    }
  }
  
  // Check for message sequence - in XMTP v3, messages often come in pairs
  // If we sent a message and then received a response, the response is likely from the bot
  if (message.id && previousMessages && previousMessages.length > 0) {
    const lastMessage = previousMessages[previousMessages.length - 1];
    if (lastMessage.sender === 'user' && message.id !== lastMessage.id) {
      // If the last message was from the user and this is a different message,
      // it's likely a response from the bot
      console.log('Message is likely from bot (response to user message)');
      return true;
    }
  }
  
  // Check for conversation topic - in XMTP v3, the conversation topic can help identify the sender
  if (message.conversationId) {
    console.log('Message has conversation ID:', message.conversationId);
    // If we know this is a conversation with the bot, and we didn't send it, it's from the bot
    if (message.conversationId.includes(SCARLETT_BOT_ADDRESS.toLowerCase())) {
      console.log('Message is likely from bot (conversation ID includes bot address)');
      return true;
    }
  }
  
  // Check content patterns as a last resort
  const isErrorMessage = typeof message.content === 'string' && (
    message.content.includes('Sorry, I encountered an error processing your message') ||
    message.content.includes("Sorry, I'm having trouble connecting right now")
  );
  
  const isBotGreeting = typeof message.content === 'string' && (
    message.content.startsWith('I am Scarlett') || 
    message.content.includes("I'm Scarlett") ||
    message.content.startsWith('Hey there') ||
    message.content.includes('Bali') ||
    message.content.includes('sunset') ||
    message.content.includes('handsome')
  );
  
  // Check for typical bot response patterns
  const isBotResponse = typeof message.content === 'string' && (
    // Error/apology messages
    message.content.includes("I'm sorry") ||
    message.content.includes("I apologize") ||
    message.content.includes("having trouble") ||
    // Greeting patterns
    message.content.includes("Hello!") ||
    message.content.includes("Hi there") ||
    // Typical bot responses
    message.content.includes("How can I help") ||
    message.content.includes("Is there anything else") ||
    // Question responses
    message.content.includes("?") && message.content.length > 40 ||
    // Typical bot content
    message.content.includes("China") && message.content.includes("😊") ||
    // Math responses
    message.content.includes("2 + 2 equals 4") ||
    // Any message with emoji and longer than 40 chars is likely from the bot
    message.content.includes("😊") && message.content.length > 40
  );
  
  // Log the content-based identification
  console.log('Message identification by content:', {
    content: message.content,
    isErrorMessage,
    isBotGreeting,
    isBotResponse,
    isBot: isErrorMessage || isBotGreeting || isBotResponse
  });
  
  return isErrorMessage || isBotGreeting || isBotResponse;
};

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { songs, loading, error } = useAllSongs();
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const xmtp = useXmtp();
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [botConversation, setBotConversation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [connectionAttempted, setConnectionAttempted] = useState(false);
  
  // Check XMTP connection status and load the bot conversation
  useEffect(() => {
    if (xmtp?.isConnected && xmtp.client) {
      console.log('XMTP connected, loading bot conversation');
      loadBotConversation();
    } else if (xmtp?.connectionError && !connectionAttempted) {
      // Add a bot message about the connection error
      const errorMessage = `I'm having trouble connecting to the messaging service. Error: ${xmtp.connectionError.message}`;
      addBotMessage(errorMessage, true);
      setConnectionAttempted(true);
    }
  }, [xmtp?.isConnected, xmtp?.connectionError]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Add a bot message to the chat
  const addBotMessage = (content: string, isErrorMessage = false) => {
    const newMessage = {
      id: `bot-${Date.now()}`,
      sender: 'Scarlett',
      content: content,
      timestamp: new Date(),
      isBot: true,
      isErrorMessage
    };
    
    setChatMessages(prev => [...prev, newMessage]);
    return newMessage;
  };
  
  // Function to get or create the bot conversation
  const loadBotConversation = async () => {
    if (!xmtp || !xmtp.client) {
      console.log('XMTP not connected, cannot load bot conversation');
      return;
    }
    
    try {
      setSendStatus('Loading conversation with Scarlett bot...');
      
      // Get our wallet address and inbox ID for comparison
      const walletAddress = await (xmtp.client as any).address;
      console.log('Our wallet address:', walletAddress);
      
      // Try to get our inbox ID from the client if available
      let ourInboxId = null;
      try {
        // This is a guess at the property name - may need adjustment based on actual SDK
        if (xmtp.client.inboxId) {
          ourInboxId = xmtp.client.inboxId;
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
            const isFromBot = isBotMessage(msg, walletAddress, processedMessages);
            
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
        
        // Only show the last INITIAL_MESSAGE_COUNT messages
        setChatMessages(formattedMessages.slice(-INITIAL_MESSAGE_COUNT));
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
            const isFromBot = isBotMessage(message, walletAddress, prev);
            
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
              
              // Keep only the last INITIAL_MESSAGE_COUNT messages plus the new one
              const newMessages = [...prev, formattedMessage];
              if (newMessages.length > INITIAL_MESSAGE_COUNT) {
                return newMessages.slice(-INITIAL_MESSAGE_COUNT);
              }
              return newMessages;
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
      
      // Use the getOrCreateConversation method to ensure we always use the same conversation
      let conversation;
      try {
        conversation = await xmtp.getOrCreateConversation(SCARLETT_BOT_ADDRESS);
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
          
          const newMessages = [...prev, newMessage];
          // Keep only the last INITIAL_MESSAGE_COUNT messages plus the new one
          if (newMessages.length > INITIAL_MESSAGE_COUNT) {
            return newMessages.slice(-INITIAL_MESSAGE_COUNT);
          }
          return newMessages;
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
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Send the message to the bot
    sendMessageToBot(message);
    
    // Clear the input
    setMessage('');
  };
  
  return (
    <div className="flex-1 flex flex-col md:container md:mx-auto md:max-w-6xl">
      {/* Songs Section */}
      <div className="flex-shrink-0 p-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{t('home.popularSongs')}</h2>
          <Link to="/songs" className="text-indigo-400 text-sm flex items-center">
            {t('home.viewAllSongs')} <ArrowRight size={16} weight="bold" className="ml-1" />
          </Link>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 text-red-400 p-4 rounded-lg text-center">
            {t('common.error')}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {songs.slice(0, 3).map((song) => (
              <Link 
                key={song.id} 
                to={`/song/${song.song_title.toLowerCase().replace(/\s+/g, '-')}`}
                className="flex flex-col items-center"
              >
                <div className="w-full aspect-square rounded-lg overflow-hidden mb-2">
                  <img 
                    src={ipfsCidToUrl(song.thumb_img_cid)} 
                    alt={song.song_title} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm font-medium text-center truncate w-full">{song.song_title}</p>
                <p className="text-xs text-neutral-400 truncate w-full">{song.artist_name}</p>
              </Link>
            ))}
          </div>
        )}
      </div>
      
      {/* Chat Section */}
      <div className="flex-1 flex flex-col bg-neutral-800 border-t border-neutral-700">
        <div className="flex-shrink-0 p-3 border-b border-neutral-700 flex justify-between items-center">
          <h2 className="text-xl font-bold">Scarlett Bot Chat</h2>
          <Link to="/chat" className="text-indigo-400 text-sm flex items-center">
            View Full Chat <ArrowRight size={16} weight="bold" className="ml-1" />
          </Link>
        </div>
        
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
        </div>
        
        {/* Chat input */}
        <div className="border-t border-neutral-700 bg-neutral-800">
          <form onSubmit={handleSendMessage} className="p-3">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
              />
              <button
                type="submit"
                className="bg-indigo-600 text-white rounded-full p-2"
                disabled={!xmtp?.isConnected}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
                  <path d="M233.86,110.48,65.8,14.58A20,20,0,0,0,37.15,38.64L67.33,128,37.15,217.36A20,20,0,0,0,56,244a20.1,20.1,0,0,0,9.81-2.58l.09-.06,168-96.07a20,20,0,0,0,0-34.81ZM63.19,215.26,88.61,140H144a12,12,0,0,0,0-24H88.61L63.18,40.72l152.76,87.17Z" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default HomePage; 