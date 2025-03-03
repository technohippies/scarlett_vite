import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';
import AudioMessage from '../../components/AudioMessage';
// Import the attachment helper
import { loadXmtpAttachmentModule } from '../../utils/xmtpAttachmentHelper';
import { KNOWN_BOT_INBOX_IDS } from '../../utils/botMessageUtils';
import { inspectClient } from '../../utils/messageInspector';
import { xmtpMessagingService } from '../../lib/xmtp/messagingService';
import { ChatMessage } from '../../types/chat';

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

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const xmtp = useXmtp();
  const appKit = useAppKit();
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageStreamCleanup = useRef<(() => void) | null>(null);
  
  // State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [botConversation, setBotConversation] = useState<any>(null);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isReownConnected, setIsReownConnected] = useState<boolean>(false);
  const [reownSigner, setReownSigner] = useState<any>(null);
  const [ourInboxId, setOurInboxId] = useState<string | null>(null);
  const [botInboxId, setBotInboxId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  
  // Debug panel component
  const MessageDebugPanel = ({ message }: { message: any }) => {
    if (!showDebug) return null;
    
    return (
      <div className="mt-1 p-2 bg-gray-800 rounded text-xs font-mono overflow-x-auto">
        <div><span className="text-blue-400">id:</span> {message.id}</div>
        <div><span className="text-blue-400">sender:</span> {message.sender}</div>
        <div><span className="text-blue-400">direction:</span> {message.direction}</div>
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
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);
  
  // Function to get or create the bot conversation
  const loadBotConversation = async () => {
    try {
      setSendStatus('Connecting to bot...');
      
      // Check if xmtp is available
      if (!xmtp || !xmtp.client) {
        console.error('XMTP client not available');
        setSendStatus('Error: XMTP client not available');
        return;
      }
      
      // Get the XMTP client and cast it to any to access properties
      const xmtpClient = xmtp.client as any;
      
      // Inspect the XMTP client to understand its structure
      inspectClient(xmtpClient, 'XMTP Client');
      
      // Get or create a conversation with the bot
      console.log('Creating or loading conversation with bot...');
      let conversation;
      try {
        // Try to create a new conversation with the bot
        conversation = await xmtp.createBotConversation();
        console.log('Bot conversation created or loaded:', conversation);
        
        // Inspect the conversation to understand its structure
        // inspectConversation(conversation, 'Bot Conversation');
      } catch (error) {
        console.error('Error creating bot conversation:', error);
        setSendStatus('Error connecting to bot. Please try again.');
        return;
      }
      
      // Store our wallet address for comparison
      let ourWalletAddress = null;
      let ourInboxId = null;
      let botInboxId = null;
      
      // Get our wallet address from the client
      if (xmtpClient.address) {
        ourWalletAddress = xmtpClient.address;
        console.log('Our wallet address:', ourWalletAddress);
      }
      
      // Get our inbox ID from the client
      if (xmtpClient.inboxId) {
        ourInboxId = xmtpClient.inboxId;
        console.log('Our inbox ID:', ourInboxId);
      }
      
      // Get bot details from conversation
      if (conversation.peerInboxId) {
        botInboxId = conversation.peerInboxId;
        console.log('Bot inbox ID:', botInboxId);
      } else if (conversation.peerAddress) {
        // Use peerAddress as fallback for botInboxId
        botInboxId = conversation.peerAddress;
        console.log('Using bot peer address as ID:', botInboxId);
      } else {
        // Try to get the bot inbox ID using the dmPeerInboxId method if available
        try {
          if (typeof conversation.dmPeerInboxId === 'function') {
            const peerInboxId = await conversation.dmPeerInboxId();
            if (peerInboxId) {
              botInboxId = peerInboxId;
              console.log('Got bot inbox ID from dmPeerInboxId method:', botInboxId);
            }
          }
        } catch (error) {
          console.error('Error getting dmPeerInboxId:', error);
        }
        
        // If still no bot inbox ID, check for known bot IDs
        if (!botInboxId && KNOWN_BOT_INBOX_IDS.length > 0) {
          botInboxId = KNOWN_BOT_INBOX_IDS[0];
          console.log('Using known bot inbox ID from constants:', botInboxId);
        }
      }
      
      // Log conversation details for debugging
      console.log('Conversation details:', {
        id: conversation.id,
        topic: conversation.topic,
        peerAddress: conversation.peerAddress,
        peerInboxId: conversation.peerInboxId,
        ourWalletAddress: ourWalletAddress,
        ourInboxId: ourInboxId,
        botInboxId: botInboxId
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
          botInboxId: KNOWN_BOT_INBOX_IDS[0]
        });
        
        console.log(`Loaded ${messages.length} messages`);
        setChatMessages(messages);
        setSendStatus(null);
        
        // Set up message stream using the messaging service
        try {
          console.log('Setting up message stream...');
          
          // Clean up any existing stream
          if (messageStreamCleanup.current) {
            messageStreamCleanup.current();
          }
          
          // Set up a new stream with the messaging service
          const { cleanup } = await xmtpMessagingService.setupMessageStream(
            conversation,
            {
              ourWalletAddress,
              ourInboxId,
              botInboxId: KNOWN_BOT_INBOX_IDS[0],
              onMessage: (message: ChatMessage) => {
                console.log('New message received:', message);
                
                // Add the message to our state
                setChatMessages(prev => {
                  // Check if we already have this message
                  const exists = prev.some(m => m.id === message.id);
                  if (exists) {
                    return prev;
                  }
                  
                  // Remove any temporary messages with the same content
                  // This prevents duplicate messages when sending
                  const filtered = prev.filter(m => 
                    !(m.id.startsWith('temp-') && 
                      m.content === message.content && 
                      (m as any).sending === true)
                  );
                  
                  return [...filtered, message];
                });
              },
              onError: (error) => {
                console.error('Error in message stream:', error);
              }
            }
          );
          
          // Store the cleanup function
          messageStreamCleanup.current = cleanup;
          
        } catch (streamError) {
          console.error('Error setting up message stream:', streamError);
        }
      } catch (messagesError) {
        console.error('Error loading messages:', messagesError);
        setChatMessages([]);
        setSendStatus('Connected to bot, but could not load previous messages');
      }
    } catch (error) {
      console.error('Error loading bot conversation:', error);
      setSendStatus('Error connecting to bot');
    }
  };
  
  // Function to send a message to the bot
  const sendMessageToBot = async (messageText: string) => {
    try {
      // Check if we have a bot conversation
      if (!botConversation) {
        console.error('No bot conversation available');
        setSendStatus('Error: No bot conversation available');
        return;
      }
      
      // Create a temporary message to show immediately
      const tempMessage: ChatMessage = {
        id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        content: messageText,
        sender: 'user', // Simple string value to avoid type errors
        timestamp: new Date(),
        isBot: true, // Force it to appear on the right side
        sending: true // Mark as sending
      } as any; // Use type assertion for the custom properties
      
      // Add the temporary message to the chat
      setChatMessages((prev) => [...prev, tempMessage]);
      
      // Set sending state
      setIsSendingMessage(true);
      
      try {
        // Send the message using the messaging service
        console.log('Sending message to bot:', messageText);
        await xmtpMessagingService.sendMessage(botConversation, messageText);
        
        // The real message will be added when it comes back through the stream
        // We can remove the temporary message once we know it's sent
        setTimeout(() => {
          setChatMessages((prev) => 
            prev.filter(msg => msg.id !== tempMessage.id)
          );
        }, 500);
        
      } catch (error: any) {
        console.error('Error sending message:', error);
        
        // Mark the temporary message as having an error
        setChatMessages((prev) => 
          prev.map(msg => 
            msg.id === tempMessage.id 
              ? { ...msg, sending: false, error: true } as any
              : msg
          )
        );
        
        setSendStatus(`Error sending message: ${error.message || 'Unknown error'}`);
      } finally {
        setIsSendingMessage(false);
      }
    } catch (error: any) {
      console.error('Error in sendMessageToBot:', error);
      setSendStatus('Error sending message');
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
      const tempMessage: ChatMessage = {
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
  
  
  // Connect to Reown only (first step)
  const handleConnectReown = async () => {
    console.log('Connecting to Reown...');
    setSendStatus('Connecting to Reown...');
    
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
      setSendStatus('Error connecting to Reown');
      return null;
    }
  };
  
  // Connect to XMTP explicitly (second step)
  const handleConnectXmtp = async () => {
    if (!isReownConnected || !reownSigner) {
      console.error('Cannot connect to XMTP: Not connected to Reown');
      setSendStatus('Error: Please connect to Reown first');
      return;
    }
    
    if (!xmtp) {
      console.error('XMTP context is not available');
      setSendStatus('Error: XMTP context is not available');
      return;
    }
    
    try {
      console.log('Connecting to XMTP with signer:', reownSigner);
      
      // Try the direct Ethers approach first
      if (xmtp.connectWithEthers) {
        console.log('Using connectWithEthers method');
        const success = await xmtp.connectWithEthers();
        
        if (!success) {
          console.log('connectWithEthers failed, falling back to connectXmtp');
          // Fall back to the regular connect method
          await xmtp.connectXmtp(reownSigner);
        }
      } else {
        // Use the connectXmtp method which is available on the context
        await xmtp.connectXmtp(reownSigner);
      }
      
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
        setSendStatus('Error: Failed to connect to XMTP');
      }
    } catch (error) {
      console.error('Error connecting to XMTP:', error);
      setSendStatus('Error: Error connecting to XMTP');
    }
  };
  
  // Add a function to check if a message is an audio attachment
  const isAudioAttachment = (content: any): boolean => {
    try {
      // For XMTP attachment format with specific structure
      if (content && content.type && 
          (content.type.authorityId === 'xmtp.org' && 
           content.type.typeId === 'attachment')) {
        // Check if the attachment is audio based on mimeType in parameters
        if (content.parameters && content.parameters.mimeType && 
            content.parameters.mimeType.startsWith('audio/')) {
          return true;
        }
        
        // Check filename for audio extensions as fallback
        if (content.parameters && content.parameters.filename) {
          const filename = content.parameters.filename.toLowerCase();
          return filename.endsWith('.mp3') || 
                 filename.endsWith('.wav') || 
                 filename.endsWith('.ogg') || 
                 filename.endsWith('.m4a');
        }
      }
      
      // Traditional attachment format (simple object with mimeType)
      if (typeof content === 'string') {
        try {
          const parsedContent = JSON.parse(content);
          return (
            parsedContent &&
            parsedContent.mimeType &&
            parsedContent.mimeType.startsWith('audio/')
          );
        } catch {
          return false;
        }
      }
      
      // Direct object with mimeType
      return content && 
             content.mimeType && 
             content.mimeType.startsWith('audio/');
    } catch (e) {
      console.error('Error in isAudioAttachment:', e);
      return false;
    }
  };

  // Function to render message content based on type
  const renderMessageContent = (msg: ChatMessage) => {
    try {
      const { content } = msg;
      
      // Handle null or undefined content
      if (content === null || content === undefined) {
        return <p className="text-sm text-red-400">Empty message</p>;
      }
      
      // Check if this is an audio attachment
      if (isAudioAttachment(content)) {
        try {
          // For XMTP attachment format structure
          let parsedContent: any = content;
          
          // If content is a string that might be JSON, try to parse it
          if (typeof content === 'string') {
            try {
              parsedContent = JSON.parse(content);
            } catch {
              // Not JSON, keep as is
              parsedContent = content;
            }
          }
          
          // Handle XMTP attachment format
          if (parsedContent && 
              typeof parsedContent === 'object' &&
              parsedContent.type && 
              parsedContent.type.authorityId === 'xmtp.org' && 
              parsedContent.type.typeId === 'attachment') {
            
            // Extract parameters and content from XMTP attachment format
            const { parameters, content: attachmentContent, encodedContent } = parsedContent;
            const mimeType = parameters?.mimeType || 'audio/mpeg';
            
            // Create audio blob if we have binary content
            if (attachmentContent && attachmentContent instanceof Uint8Array) {
              const audioUrl = URL.createObjectURL(new Blob([attachmentContent], { type: mimeType }));
              return (
                <AudioMessage 
                  src={audioUrl} 
                  isOwnMessage={!msg.isBot}
                />
              );
            }
            
            // Try using encodedContent if available
            if (encodedContent && encodedContent.content && encodedContent.content instanceof Uint8Array) {
              const audioUrl = URL.createObjectURL(new Blob([encodedContent.content], { type: mimeType }));
              return (
                <AudioMessage 
                  src={audioUrl} 
                  isOwnMessage={!msg.isBot}
                />
              );
            }
            
            // If we don't have binary content but have a fallback message
            if (parsedContent.fallback) {
              return (
                <div>
                  <p className="text-sm text-amber-400">Audio attachment available but cannot be played</p>
                  <p className="text-xs text-gray-400">{parsedContent.fallback}</p>
                </div>
              );
            }
          }
          
          // Traditional attachment format handling
          if (typeof parsedContent === 'object' && 
              parsedContent.mimeType && 
              typeof parsedContent.mimeType === 'string' && 
              parsedContent.mimeType.startsWith('audio/')) {
            
            const audioUrl = parsedContent.url || 
                            (parsedContent.data ? 
                              URL.createObjectURL(new Blob([parsedContent.data], { type: parsedContent.mimeType })) : 
                              '');
            
            if (audioUrl) {
          return (
            <AudioMessage 
              src={audioUrl} 
                  isOwnMessage={!msg.isBot}
            />
          );
            }
          }
        } catch (audioError) {
          console.error('Error rendering audio message:', audioError);
          return <p className="text-sm text-red-400">Error displaying audio message</p>;
        }
      }
      
      // Regular text message
        return <p className="text-sm whitespace-pre-wrap break-words">{content}</p>;
    } catch (error) {
      console.error('Error in renderMessageContent:', error);
      return <p className="text-sm text-red-400">Error displaying message</p>;
    }
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
          
          {sendStatus && (
            <div className={`p-2 rounded flex items-center ${
              sendStatus.includes('Error') 
                ? 'bg-red-900/20 text-red-400' 
                : sendStatus.includes('Sending') 
                  ? 'bg-blue-900/20 text-blue-400' 
                  : 'bg-green-900/20 text-green-400'
            }`}>
              {sendStatus.includes('Sending') && (
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-current rounded-full border-t-transparent"></div>
              )}
              {sendStatus.includes('Error') && (
                <span className="mr-2">⚠️</span>
              )}
              {sendStatus.includes('sent') && (
                <span className="mr-2">✓</span>
              )}
              {sendStatus}
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
          {chatMessages.map(msg => {
            // Determine if this is a bot message by checking the senderInboxId
            const isBotMessage = msg.isBot || 
                               (msg as any).rawMessage?.senderInboxId === botInboxId;
            
            return (
              <div 
                key={msg.id} 
                className={`flex ${
                  !isBotMessage ? 'justify-start' : 'justify-end'
                } mb-4`}
              >
                <div 
                  className={`max-w-[80%] p-3 rounded-lg ${
                    !isBotMessage 
                      ? 'bg-neutral-800 text-white rounded-tl-none' 
                      : 'bg-indigo-600 text-white rounded-tr-none'
                  }`}
                >
                  {renderMessageContent({...msg, isBot: isBotMessage} as ChatMessage)}
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs opacity-70">
                  {formatMessageTime(msg.timestamp)}
                    </p>
                    {(msg as any).sending && (
                      <div className="animate-spin ml-2 h-3 w-3 border-2 border-current rounded-full border-t-transparent opacity-70"></div>
                    )}
                    {(msg as any).error && (
                      <span className="ml-2 text-red-400 text-xs">⚠️</span>
                    )}
              </div>
            </div>
                <MessageDebugPanel message={{...msg, isBot: isBotMessage}} />
            </div>
            );
          })}
          
          <div ref={messagesEndRef} />
        </div>
        
        {/* Chat input */}
        <div className="border-t border-neutral-700 bg-neutral-900">
          <ChatInput 
            onSendMessage={sendMessageToBot} 
            onSendAudio={sendAudioAttachment}
            placeholder={t('chat.placeholder')}
            disabled={isSendingMessage}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 