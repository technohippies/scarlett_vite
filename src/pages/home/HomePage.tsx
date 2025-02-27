import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllSongs } from '../../hooks/useSongs';
import { ArrowRight } from '@phosphor-icons/react';
import { ipfsCidToUrl } from '../../lib/tableland/client';
import { useXmtp } from '../../context/XmtpContext';

// The bot address - consistent across the application
const SCARLETT_BOT_ADDRESS = '0xc94A2d246026CedEE7d395B5B94C83aaCAd67773';
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

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { songs, loading, error } = useAllSongs();
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const xmtp = useXmtp();
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [botConversation, setBotConversation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
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
      
      // Use the getOrCreateConversation method to ensure we always use the same conversation
      const conversation = await xmtp.getOrCreateConversation(SCARLETT_BOT_ADDRESS);
      console.log('Got conversation with Scarlett bot:', conversation);
      setBotConversation(conversation);
      
      // Load messages from this conversation
      try {
        const messages = await conversation.messages();
        console.log(`Loaded ${messages.length} messages from conversation`);
        
        // Get our wallet address for comparison
        const walletAddress = await xmtp.client.address;
        console.log('Our wallet address:', walletAddress);
        
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
              direction: msg.direction
            });
            
            // In XMTP v3, we can use the direction property if available
            // or check if we're the sender by comparing with our wallet address
            let isFromBot = false;
            
            if (msg.direction === 'received') {
              // If direction is 'received', it's from the bot
              isFromBot = true;
              console.log('Message is from bot (direction: received)');
            } else if (msg.direction === 'sent') {
              // If direction is 'sent', it's from us
              isFromBot = false;
              console.log('Message is from user (direction: sent)');
            } else {
              // If direction is not available, use content-based heuristics
              const isErrorMessage = typeof msg.content === 'string' && 
                msg.content.includes('Sorry, I encountered an error processing your message');
              const isBotGreeting = typeof msg.content === 'string' && 
                (msg.content.startsWith('I am Scarlett') || 
                 msg.content.startsWith('Hey there') ||
                 msg.content.includes('Bali'));
              
              // Determine if message is from bot based on content patterns
              isFromBot = isErrorMessage || isBotGreeting;
              
              console.log('Message identification by content:', {
                content: msg.content,
                isErrorMessage,
                isBotGreeting,
                isFromBot
              });
            }
            
            const formattedMessage = {
              id: msg.id || Date.now().toString(),
              content: typeof msg.content === 'object' ? JSON.stringify(msg.content) : msg.content,
              sender: isFromBot ? 'bot' : 'user',
              timestamp: new Date(msg.sent || Date.now())
            };
            
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
      
      // Create a stream of messages
      try {
        // Use the stream method instead of streamMessages
        const stream = botConversation.stream((error: Error | null, message: any) => {
          if (error) {
            console.error('Error in message stream:', error);
            return;
          }
          
          if (!message) {
            console.log('No message received from stream');
            return;
          }
          
          console.log('New message received:', {
            id: message.id,
            content: message.content,
            senderAddress: message.senderAddress,
            recipientAddress: message.recipientAddress,
            sent: message.sent,
            messageVersion: message.messageVersion,
            contentTopic: message.contentTopic,
            direction: message.direction
          });
          
          // Only add the message if it's not already in the chat
          setChatMessages(prev => {
            const messageExists = prev.some(msg => msg.id === message.id);
            
            if (!messageExists) {
              // In XMTP v3, we can use the direction property if available
              let isFromBot = false;
              
              if (message.direction === 'received') {
                // If direction is 'received', it's from the bot
                isFromBot = true;
                console.log('Stream message is from bot (direction: received)');
              } else if (message.direction === 'sent') {
                // If direction is 'sent', it's from us
                isFromBot = false;
                console.log('Stream message is from user (direction: sent)');
              } else {
                // If direction is not available, use content-based heuristics
                const isErrorMessage = typeof message.content === 'string' && 
                  message.content.includes('Sorry, I encountered an error processing your message');
                const isBotGreeting = typeof message.content === 'string' && 
                  (message.content.startsWith('I am Scarlett') || 
                   message.content.startsWith('Hey there') ||
                   message.content.includes('Bali'));
                
                // Determine if message is from bot based on content patterns
                isFromBot = isErrorMessage || isBotGreeting;
                
                console.log('Stream message identification by content:', {
                  content: message.content,
                  isErrorMessage,
                  isBotGreeting,
                  isFromBot
                });
              }
              
              const formattedMessage = {
                id: message.id || Date.now().toString(),
                content: typeof message.content === 'object' ? JSON.stringify(message.content) : message.content,
                sender: isFromBot ? 'bot' : 'user',
                timestamp: new Date(message.sent || Date.now())
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
        // Add the message to the local chat immediately for better UX
        const newMessage = {
          id: Date.now().toString(),
          content: messageContent,
          sender: 'user',
          timestamp: new Date(),
          isBot: false
        };
        
        setChatMessages(prev => {
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
                to={`/song/${song.song_title}`}
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