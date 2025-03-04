import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';
// Import the attachment helper
import { loadXmtpAttachmentModule } from '../../utils/xmtpAttachmentHelper';
import { KNOWN_BOT_INBOX_IDS } from '../../utils/botMessageUtils';
import { xmtpMessagingService } from '../../lib/xmtp/messagingService';
import { ChatMessage as BaseChatMessage } from '../../types/chat';

// Extend the ChatMessage type to include additional properties
interface ExtendedChatMessage extends BaseChatMessage {
  sending?: boolean;
  error?: boolean;
  direction?: 'sent' | 'received';
  senderInboxId?: string;
}

// Simple date formatter function with improved error handling
const formatMessageTime = (timestamp: any) => {
  try {
    // If timestamp is null, undefined, or not a valid date object
    if (!timestamp) {
      return 'Unknown time';
    }
    
    // If timestamp is a string (ISO format) or number (timestamp), convert to Date object
    let date: Date;
    if (typeof timestamp === 'string') {
      date = new Date(timestamp);
    } else if (typeof timestamp === 'number') {
      date = new Date(timestamp);
    } else if (timestamp instanceof Date) {
      date = timestamp;
    } else {
      return 'Invalid time format';
    }
    
    // Check if the Date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown time';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) {
      const hours = Math.floor(diffMins / 60);
      return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    }
    
    // For messages older than a day, show the date
    return date.toLocaleString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch (error) {
    console.error('Error formatting timestamp:', error, timestamp);
    return 'Unknown time';
  }
};

// Type definition for the cleanup function
type CleanupFunction = () => void;

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const xmtp = useXmtp();
  const appKit = useAppKit();
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageStreamCleanup = useRef<CleanupFunction | null>(null);
  
  // State
  const [chatMessages, setChatMessages] = useState<ExtendedChatMessage[]>([]);
  const [botConversation, setBotConversation] = useState<any>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isReownConnected, setIsReownConnected] = useState<boolean>(false);
  const [reownSigner, setReownSigner] = useState<any>(null);
  const [ourInboxId, setOurInboxId] = useState<string | null>(null);
  const [botInboxId, setBotInboxId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isXmtpConnected, setIsXmtpConnected] = useState(false);
  
  // Debug panel component
  const MessageDebugPanel = ({ message }: { message: ExtendedChatMessage }) => {
    if (!showDebug) return null;
    
    return (
      <div className="mt-1 p-2 bg-gray-800 rounded text-xs font-mono overflow-x-auto">
        <div><span className="text-blue-400">id:</span> {message.id}</div>
        <div><span className="text-blue-400">sender:</span> {message.sender}</div>
        <div><span className="text-blue-400">direction:</span> {message.direction || 'N/A'}</div>
        <div><span className="text-blue-400">isBot:</span> {String(message.isBot)}</div>
        <div><span className="text-blue-400">senderInboxId:</span> {message.senderInboxId || 'N/A'}</div>
        <div><span className="text-blue-400">botInboxId:</span> {botInboxId || 'N/A'}</div>
        <div><span className="text-blue-400">ourInboxId:</span> {ourInboxId || 'N/A'}</div>
      </div>
    );
  };
  
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
  
  // Effect to load the bot conversation when XMTP is connected
  useEffect(() => {
    if (xmtp && xmtp.isConnected && !botConversation) {
      console.log('XMTP connected, loading bot conversation...');
      loadBotConversation();
    }
  }, [xmtp, xmtp?.isConnected, botConversation]);
  
  // Effect to periodically check if the message stream is active
  useEffect(() => {
    if (!botConversation) return;
    
    // Check every 30 seconds if the message stream is active
    const intervalId = setInterval(() => {
      if (botConversation && !messageStreamCleanup.current) {
        console.warn('⚠️ Message stream is not active. Re-establishing stream...');
        loadBotConversation();
      }
    }, 30000);
    
    // Clean up the interval when the component unmounts
    return () => clearInterval(intervalId);
  }, [botConversation]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Log message updates for debugging
    console.log(`🔄 Chat messages updated, new count: ${chatMessages.length}`);
    
    // Log the last few messages for debugging
    if (chatMessages.length > 0) {
      const lastMessages = chatMessages.slice(-3);
      console.log('Last messages:', lastMessages.map(msg => ({
        id: msg.id,
        sender: msg.sender,
        isBot: msg.isBot,
        contentPreview: typeof msg.content === 'string' 
          ? msg.content.substring(0, 50) 
          : 'non-string content'
      })));
    }
  }, [chatMessages]);
  
  // Load the bot conversation
  const loadBotConversation = async () => {
    if (!xmtp || !xmtp.client) {
      console.error('Cannot load bot conversation: XMTP client not initialized');
      setSendStatus('Please connect to XMTP first');
      return;
    }
    
    try {
      setSendStatus('Connecting to bot...');
      
      // Get the wallet address from the XMTP client
      const ourWalletAddress = (xmtp.client as any).address;
      console.log(`Our wallet address: ${ourWalletAddress}`);
      
      // Get our inbox ID from the client
      const ourInboxId = xmtp.client.inboxId || '';
      console.log(`Our inbox ID: ${ourInboxId}`);
      
      // Use a known bot inbox ID
      const botInboxId = KNOWN_BOT_INBOX_IDS[0];
      console.log(`Using bot inbox ID: ${botInboxId}`);
      
      // Create a conversation with the bot
      console.log('Creating conversation with bot...');
      const conversation = await xmtp.createBotConversation();
      
      if (!conversation) {
        console.error('Failed to create bot conversation');
        setSendStatus('Error: Failed to create bot conversation');
        return;
      }
      
      console.log('Bot conversation created successfully:', {
        id: conversation.id || conversation.topic,
        topic: conversation.topic,
        peerAddress: conversation.peerAddress,
        peerInboxId: conversation.peerInboxId
      });
      
      // Store the conversation and IDs for later use
      setBotConversation(conversation);
      setOurInboxId(ourInboxId);
      setBotInboxId(botInboxId);
      
      // Try to load messages
      try {
        setSendStatus('Loading messages...');
        
        // Load messages using the messaging service
        const messages = await xmtpMessagingService.loadMessages(conversation, {
          ourWalletAddress,
          ourInboxId,
          botInboxId: botInboxId || KNOWN_BOT_INBOX_IDS[0]
        });
        
        console.log(`Loaded ${messages.length} messages`);
        setChatMessages(messages);
        setSendStatus(null);
        
        // Set up the message stream
        try {
          console.log('Setting up message stream...');
          
          // Clean up any existing stream
          if (messageStreamCleanup.current) {
            console.log('Cleaning up existing message stream');
            try {
              messageStreamCleanup.current();
            } catch (cleanupError) {
              console.error('Error cleaning up existing message stream:', cleanupError);
            }
            messageStreamCleanup.current = null;
          }
          
          // Set up a new stream with the messaging service
          console.log('Creating new message stream for conversation:', conversation.topic || conversation.id);
          const { cleanup } = await xmtpMessagingService.setupMessageStream(
            conversation,
            {
              ourWalletAddress,
              ourInboxId,
              botInboxId: botInboxId || KNOWN_BOT_INBOX_IDS[0],
              onMessage: (message: ExtendedChatMessage) => {
                console.log('📥 New message received in onMessage callback:', {
                  id: message.id,
                  sender: message.sender,
                  isBot: message.isBot,
                  contentType: typeof message.content,
                  contentPreview: typeof message.content === 'string' 
                    ? message.content.substring(0, 50) 
                    : 'non-string content'
                });
                
                // Add the message to our state
                setChatMessages(prev => {
                  // Check if we already have this message
                  const exists = prev.some(m => m.id === message.id);
                  if (exists) {
                    console.log(`⚠️ Message ${message.id} already exists in chat state, not adding`);
                    return prev;
                  }
                  
                  console.log(`🔍 Current chat messages count: ${prev.length}`);
                  
                  // Remove any temporary messages with the same content
                  // This prevents duplicate messages when sending
                  const filtered = prev.filter(m => {
                    const isTempMessage = m.id.startsWith('temp-') && 
                      m.content === message.content && 
                      (m as any).sending === true;
                    
                    if (isTempMessage) {
                      console.log(`🔄 Removing temporary message with content matching ${message.id}`);
                    }
                    
                    return !isTempMessage;
                  });
                  
                  console.log(`➕ Adding new message ${message.id} to chat state (total: ${filtered.length + 1})`);
                  
                  // Force scroll to bottom on next render
                  setTimeout(() => {
                    if (messagesEndRef.current) {
                      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
                    }
                  }, 100);
                  
                  // Ensure we're actually adding the new message
                  const newMessages = [...filtered, message];
                  console.log(`📊 Updated chat messages count: ${newMessages.length}`);
                  
                  // Debug log all messages to verify state
                  newMessages.forEach((msg, index) => {
                    console.log(`Message ${index}: ${msg.id} - ${typeof msg.content === 'string' ? msg.content.substring(0, 30) : 'non-string content'}`);
                  });
                  
                  return newMessages;
                });
              },
              onError: (error) => {
                console.error('❌ Error in message stream:', error);
                
                // Check if this is a worker error (likely XMTP worker)
                const errorString = String(error);
                const isWorkerError = errorString.includes('Worker') || 
                                     errorString.includes('error decoding response body') ||
                                     errorString.includes('expected `,` or `}`');
                
                if (isWorkerError) {
                  console.log('Detected XMTP worker error, attempting immediate recovery...');
                  
                  // Clear the current cleanup function
                  messageStreamCleanup.current = null;
                  
                  // Try to recover from worker errors by re-establishing the stream with a shorter delay
                  setTimeout(() => {
                    console.log('🔄 Attempting to recover from worker error by re-establishing stream...');
                    loadBotConversation();
                  }, 1000);
                } else {
                  // For other errors, use a longer delay
                  setTimeout(() => {
                    console.log('🔄 Attempting to recover from stream error by re-establishing stream...');
                    loadBotConversation();
                  }, 3000);
                }
              },
              onClose: () => {
                console.log('Message stream closed');
                messageStreamCleanup.current = null;
                
                // Try to reconnect if the stream closes unexpectedly
                console.log('Message stream closed unexpectedly, attempting to reconnect...');
                setTimeout(() => {
                  if (!messageStreamCleanup.current) {
                    console.log('Reconnecting message stream after unexpected close');
                    loadBotConversation();
                  }
                }, 2000);
              }
            }
          );
          
          // Store the cleanup function for later
          messageStreamCleanup.current = cleanup;
          console.log('Message stream setup complete');
        } catch (streamError) {
          console.error('Error setting up message stream:', streamError);
          setSendStatus('Error setting up message stream. Please try again.');
          
          // Try to recover automatically after a delay
          setTimeout(() => {
            console.log('Attempting automatic recovery after stream setup error...');
            loadBotConversation();
          }, 5000);
        }
      } catch (loadError) {
        console.error('Error loading messages:', loadError);
        setSendStatus('Error loading messages. Please try again.');
      }
    } catch (error) {
      console.error('Error loading bot conversation:', error);
      setSendStatus('Error connecting to bot. Please try again.');
    }
  };
  
  // Function to send a message to the bot
  const sendMessageToBot = async (messageText: string) => {
    try {
      // Check if we have a bot conversation and xmtp
      if (!botConversation) {
        console.error('Cannot send message: No bot conversation');
        setSendStatus('Error: Please connect to XMTP first');
        return;
      }
      
      console.log(`📤 Preparing to send message to bot: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
      
      // Create a temporary message to show in the UI
      const tempMessage: ExtendedChatMessage = {
        id: `temp-${Date.now()}`,
        content: messageText,
        sender: 'user', // This is a user message, not a bot message
        timestamp: new Date(),
        isBot: false, // Explicitly mark as NOT a bot message
        sending: true
      };
      
      // Add the temporary message to the chat
      console.log(`➕ Adding temporary message ${tempMessage.id} to chat state`);
      setChatMessages(prev => [...prev, tempMessage]);
      
      // Set sending state
      setIsSendingMessage(true);
      console.log('🔄 Setting isSendingMessage to true');
      
      try {
        // Send the message using the messaging service
        console.log(`📨 Sending message to bot via XMTP: "${messageText.substring(0, 50)}${messageText.length > 50 ? '...' : ''}"`);
        const sentMessage = await xmtpMessagingService.sendMessage(botConversation, messageText);
        console.log('✅ Message sent successfully via XMTP:', sentMessage);
        
        // Log the current message stream status
        console.log('🔍 Current message stream status:', {
          botConversation: botConversation ? 'exists' : 'missing',
          messageStreamCleanup: messageStreamCleanup.current ? 'exists' : 'missing',
          chatMessagesCount: chatMessages.length
        });
        
        // Verify the message stream is active
        if (!messageStreamCleanup.current) {
          console.warn('⚠️ Message stream is not active after sending message. Re-establishing stream...');
          await loadBotConversation();
        }
        
        // The real message will be added when it comes back through the stream
        // We can remove the temporary message once we know it's sent
        setTimeout(() => {
          setChatMessages((prev) => {
            const newMessages = prev.filter(msg => msg.id !== tempMessage.id);
            console.log(`🔄 Removing temporary message ${tempMessage.id} after successful send (remaining: ${newMessages.length})`);
            return newMessages;
          });
        }, 500);
      } catch (error: any) {
        console.error('❌ Error sending message:', error);
        
        // Mark the temporary message as having an error
        setChatMessages((prev) => {
          console.log(`⚠️ Marking temporary message ${tempMessage.id} as error`);
          return prev.map(msg => 
            msg.id === tempMessage.id 
              ? { ...msg, sending: false, error: true } as any
              : msg
          );
        });
        
        // Show error status
        setSendStatus(`Error sending message: ${error.message || 'Unknown error'}`);
      } finally {
        // Reset sending state
        setIsSendingMessage(false);
        console.log('🔄 Setting isSendingMessage to false');
      }
    } catch (error: any) {
      console.error('❌ Unexpected error in sendMessageToBot:', error);
      setSendStatus(`Unexpected error: ${error.message || 'Unknown error'}`);
      setIsSendingMessage(false);
    }
  };
  
  // Function to send an audio attachment
  const sendAudioAttachment = async (audioFile: File) => {
    try {
      // Check if we have a bot conversation and xmtp
      if (!botConversation || !xmtp) {
        console.error('No bot conversation or XMTP client available');
        setSendStatus('Error: No bot conversation available');
      return;
    }
    
      // Set sending state
      setIsSendingMessage(true);
      
      // Make sure the attachment module is loaded
      if (!xmtp.attachmentModule?.isLoaded) {
        console.log('Loading XMTP attachment module...');
        await loadXmtpAttachmentModule();
        console.log('XMTP attachment module loaded');
      }
      
      // Create a temporary user message to add to the UI immediately
      const tempMessage: ExtendedChatMessage = {
        id: `temp-audio-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        content: 'Audio message',
        sender: 'user',
        timestamp: new Date(),
        isBot: true, // Force it to appear on the right side
        sending: true // Mark as sending
      } as any;
      
      // Add the temporary message to the UI
      setChatMessages(prev => [...prev, tempMessage]);
      
      // Get the attachment codec from the XMTP context
      const { AttachmentCodec } = xmtp.attachmentModule || {};
      
      if (!AttachmentCodec) {
        throw new Error('Attachment codec not available');
      }
      
      // Create the attachment content
        const attachment = {
          filename: audioFile.name,
          mimeType: audioFile.type,
        data: new Uint8Array(await audioFile.arrayBuffer())
      };
      
      console.log('Sending audio attachment:', {
        filename: attachment.filename,
        mimeType: attachment.mimeType,
        dataSize: attachment.data.length
      });
      
      try {
        // Send the audio attachment
        console.log('Sending audio attachment:', audioFile.name);
        await xmtpMessagingService.sendMessage(
          botConversation,
          { content: attachment, contentType: AttachmentCodec }
        );
        
        // The real message will be added when it comes back through the stream
        // We can remove the temporary message once we know it's sent
        setTimeout(() => {
          setChatMessages((prev) => 
            prev.filter(msg => msg.id !== tempMessage.id)
          );
        }, 500);
      } catch (error: any) {
        console.error('Error sending audio message:', error);
        
        // Mark the temporary message as having an error
        setChatMessages((prev) => 
          prev.map(msg => 
            msg.id === tempMessage.id 
              ? { ...msg, sending: false, error: true } as any
              : msg
          )
        );
        
        setSendStatus(`Error sending audio message: ${error.message || 'Unknown error'}`);
      } finally {
        setIsSendingMessage(false);
      }
    } catch (error: any) {
      console.error('Error in sendAudioAttachment:', error);
      setSendStatus(`Error sending audio message: ${error.message || 'Unknown error'}`);
      setIsSendingMessage(false);
    }
  };
  
  // Connect to Reown explicitly (first step)
  const handleConnectReown = async () => {
    try {
      console.log('Connecting to Reown...');
      setSendStatus('Connecting to Reown...');
      
      if (!appKit) {
        console.error('AppKit context is not available');
        setSendStatus('Error: AppKit context is not available');
        return;
      }
      
      // Connect to Reown using the connectWallet method
      const signer = await appKit.connectWallet();
      
      if (signer) {
        console.log('Connected to Reown successfully');
        setIsReownConnected(true);
        setReownSigner(signer);
        setSendStatus('Connected to Reown. Now connect to XMTP.');
      } else {
        console.error('Failed to get signer from Reown');
        setSendStatus('Error: Failed to connect to Reown');
      }
    } catch (error: any) {
      console.error('Error connecting to Reown:', error);
      setSendStatus(`Error connecting to Reown: ${error.message || 'Unknown error'}`);
    }
  };
  
  // Connect to XMTP explicitly (second step)
  const handleConnectXmtp = async () => {
    if (!appKit || !appKit.ethersSigner) {
      console.error('Cannot connect to XMTP: No signer available');
      setSendStatus('Error: Please connect to Reown first to get a signer');
      return;
    }
    
    if (!xmtp) {
      console.error('XMTP context is not available');
      setSendStatus('Error: XMTP context is not available');
      return;
    }
    
    try {
      console.log('Connecting to XMTP with signer:', appKit.ethersSigner);
      
      // Try to connect with ethers first
      console.log('Using connectWithEthers method');
      const success = await xmtp.connectWithEthers();
      
      if (!success) {
        console.log('connectWithEthers failed, falling back to connectXmtp');
        await xmtp.connectXmtp(appKit.ethersSigner);
      }
      
      setIsXmtpConnected(true);
      
      // Load the bot conversation after connecting
      await loadBotConversation();
    } catch (error) {
      console.error('Error connecting to XMTP:', error);
      setSendStatus('Error: Error connecting to XMTP');
    }
  };
  
  // Function to render message content based on type
  const renderMessageContent = (message: ExtendedChatMessage) => {
    // Handle null or undefined content
    if (!message.content) {
      console.log(`⚠️ Message ${message.id} has null or undefined content`);
      return <span className="text-gray-400 italic">Empty message</span>;
    }
    
    // Log the message content type for debugging
    console.log(`🔍 Rendering message ${message.id}:`, {
      contentType: typeof message.content,
      sender: message.sender,
      isBot: message.isBot,
      contentPreview: typeof message.content === 'string' 
        ? message.content.substring(0, 50) 
        : 'non-string content'
    });

    // Handle attachment objects
    if (typeof message.content === 'object') {
      console.log(`🔍 Message ${message.id} has object content`);
      
      try {
        // Use type assertion to access properties safely
        const content = message.content as any;
        
        // Check if this is an XMTP attachment
        if (content && content.type && 
            typeof content.type === 'object' &&
            content.type.authorityId === 'xmtp.org' && 
            content.type.typeId === 'attachment') {
          
          console.log(`🎵 Message ${message.id} is an audio attachment`);
          
          try {
            // Try to create a blob from the binary content
            if (content.content && (content.content instanceof Uint8Array || Array.isArray(content.content))) {
              console.log(`Creating audio blob from binary content for message ${message.id}`);
              
              // Safely create a blob from the binary content
              try {
                const blob = new Blob([content.content], { type: 'audio/mpeg' });
                const url = URL.createObjectURL(blob);
                
                return (
                  <div className="audio-player-container">
                    <audio controls src={url} className="w-full" />
                  </div>
                );
              } catch (blobError) {
                console.error(`❌ Error creating blob for message ${message.id}:`, blobError);
                return <span className="text-gray-400 italic">Error creating audio player</span>;
              }
            }
            
            // If no binary content, try to use encoded content
            if (content.encodedContent && typeof content.encodedContent === 'string') {
              console.log(`Creating audio blob from encoded content for message ${message.id}`);
              
              try {
                const binary = atob(content.encodedContent);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                  bytes[i] = binary.charCodeAt(i);
                }
                
                const blob = new Blob([bytes], { type: 'audio/mpeg' });
                const url = URL.createObjectURL(blob);
                
                return (
                  <div className="audio-player-container">
                    <audio controls src={url} className="w-full" />
                  </div>
                );
              } catch (decodeError) {
                console.error(`❌ Error decoding encoded content for message ${message.id}:`, decodeError);
                return <span className="text-gray-400 italic">Error decoding audio content</span>;
              }
            }
            
            console.log(`⚠️ Audio attachment ${message.id} has no content or encodedContent`);
            return <span className="text-gray-400 italic">Audio attachment (unable to play)</span>;
          } catch (audioError) {
            console.error(`❌ Error processing audio attachment ${message.id}:`, audioError);
            return <span className="text-gray-400 italic">Error processing audio attachment</span>;
          }
        }
        
        // For other object types, safely stringify
        try {
          // Use a replacer function to handle circular references and binary data
          const safeReplacer = (_key: string, value: any) => {
            if (value instanceof Uint8Array) {
              return `[Binary data (${value.length} bytes)]`;
            }
            if (typeof value === 'bigint') {
              return value.toString();
            }
            return value;
          };
          
          const stringified = JSON.stringify(message.content, safeReplacer, 2);
          return <pre className="text-sm whitespace-pre-wrap">{stringified}</pre>;
        } catch (stringifyError) {
          console.error(`❌ Error stringifying object content for message ${message.id}:`, stringifyError);
          return <span className="text-gray-400 italic">[Complex object - cannot display]</span>;
        }
      } catch (error) {
        console.error(`❌ Error processing object content for message ${message.id}:`, error);
        return <span className="text-gray-400 italic">Error displaying message content</span>;
      }
    }
    
    // For string content, render as text
    if (typeof message.content === 'string') {
      // Check if it's JSON
      try {
        // First check if it starts with { or [ to avoid unnecessary parsing attempts
        if ((message.content.trim().startsWith('{') && message.content.trim().endsWith('}')) || 
            (message.content.trim().startsWith('[') && message.content.trim().endsWith(']'))) {
          
          try {
            const parsed = JSON.parse(message.content);
            console.log(`📄 Message ${message.id} contains JSON:`, parsed);
            
            // If it has a specific structure we recognize, render accordingly
            if (parsed.type === 'question' && parsed.options) {
              // Render question UI - using simple text for now
              return (
                <div className="question-container">
                  <p className="font-medium">{parsed.question}</p>
                  <div className="options-list mt-2">
                    {parsed.options.map((option: string, index: number) => (
                      <div key={index} className="option p-2 border rounded mb-1 cursor-pointer hover:bg-gray-100">
                        {option}
                      </div>
                    ))}
                  </div>
                </div>
              );
            }
            
            // Otherwise, render as formatted JSON
            return <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(parsed, null, 2)}</pre>;
          } catch (parseError) {
            console.log(`📝 Message ${message.id} contains text that looks like JSON but failed to parse:`, parseError);
            return <span className="whitespace-pre-wrap">{message.content}</span>;
          }
        }
        
        // Not JSON-like, render as plain text
        console.log(`📝 Message ${message.id} contains plain text`);
        return <span className="whitespace-pre-wrap">{message.content}</span>;
      } catch (e) {
        // JSON parsing error, render as plain text
        console.log(`📝 Message ${message.id} contains plain text (JSON parse failed)`);
        return <span className="whitespace-pre-wrap">{message.content}</span>;
      }
    }
    
    // For other types, stringify
    console.log(`⚠️ Message ${message.id} has unknown content type:`, typeof message.content);
    return <span className="text-gray-400 italic">Unsupported message format</span>;
  };
  
  // Clean up message stream on unmount
  useEffect(() => {
    return () => {
      // Clean up the message stream if it exists
      if (messageStreamCleanup.current) {
        console.log('Cleaning up message stream on component unmount');
        messageStreamCleanup.current();
      }
    };
  }, []);
  
  if (!isReownConnected) {
    return (
      <div className="container mx-auto px-4 py-6">
        {/* Page header with back button */}
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink="/"
          title={t('chat.title')}
        />
        
        <div className="mt-8 text-center">
          <p className="text-lg mb-4">Connect to Reown to start chatting</p>
          <button
            onClick={handleConnectReown}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
          >
            Connect to Reown
          </button>
          {sendStatus && (
            <p className="mt-4 text-sm text-gray-600">{sendStatus}</p>
          )}
        </div>
      </div>
    );
  }
  
  if (!xmtp?.isConnected) {
    return (
      <div className="container mx-auto px-4 py-6">
        {/* Page header with back button */}
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink="/"
          title={t('chat.title')}
        />
        
        <div className="mt-8 text-center">
          <p className="text-lg mb-4">Connect to XMTP to start chatting</p>
          <button
            onClick={handleConnectXmtp}
            className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded"
          >
            Connect to XMTP
          </button>
          {sendStatus && (
            <p className="mt-4 text-sm text-gray-600">{sendStatus}</p>
          )}
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6 flex flex-col h-screen">
      {/* Page header with back button */}
      <PageHeader
        leftIcon={<CaretLeft size={24} />}
        leftLink="/"
        title={t('chat.title')}
        rightIcon={
          <button 
            onClick={() => setShowDebug(!showDebug)} 
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            {showDebug ? 'Hide Debug' : 'Debug'}
          </button>
        }
      />
      
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {chatMessages.map((message) => (
          <div 
            key={message.id} 
            className={`flex ${message.isBot ? 'justify-start' : 'justify-end'}`}
          >
            <div 
              className={`max-w-[80%] p-3 rounded-lg ${
                message.isBot 
                  ? 'bg-gray-100 text-gray-900' 
                  : 'bg-blue-500 text-white'
              } ${message.sending ? 'opacity-70' : ''}`}
            >
              {renderMessageContent(message)}
              <div className="text-xs mt-1 opacity-70">
                {formatMessageTime(message.timestamp)}
                {message.sending && ' (sending...)'}
              </div>
              <MessageDebugPanel message={message} />
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {/* Chat input */}
      <div className="py-4 border-t">
        <ChatInput 
          onSendMessage={sendMessageToBot} 
          onSendAudio={sendAudioAttachment}
          disabled={isSendingMessage || !botConversation}
          placeholder={
            !botConversation 
              ? 'Connecting to bot...' 
              : isSendingMessage 
                ? 'Sending...' 
                : 'Type a message...'
          }
        />
        {sendStatus && (
          <div className="text-sm text-gray-500 mt-2">{sendStatus}</div>
        )}
      </div>
    </div>
  );
};

export default ChatPage; 