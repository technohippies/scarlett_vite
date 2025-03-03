import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft, Gear, Microphone, PaperPlaneRight, XCircle } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import { useParams, useNavigate } from 'react-router-dom';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';
import AudioMessage from '../../components/AudioMessage';
// Import the attachment helper
import { loadXmtpAttachmentModule } from '../../utils/xmtpAttachmentHelper';
import { isBotMessage, logMessageDirectionInfo, KNOWN_BOT_INBOX_IDS } from '../../utils/botMessageUtils';
import { inspectMessage, inspectConversation, inspectClient } from '../../utils/messageInspector';

// Helper function for stable object stringification to create consistent hashes
const stableStringify = (obj: any): string => {
  if (!obj || typeof obj !== 'object') {
    return String(obj);
  }
  
  try {
    const cache: any[] = [];
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        // Handle circular references
        if (cache.includes(value)) {
          return '[Circular]';
        }
        cache.push(value);
      }
      return value;
    }, 2);
  } catch (error) {
    console.warn('Error in stableStringify:', error);
    return `[Object-${Date.now()}]`;
  }
};

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
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [botConversation, setBotConversation] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isReownConnected, setIsReownConnected] = useState(false);
  const [reownSigner, setReownSigner] = useState<any>(null);
  const [connectionError, setConnectionError] = useState<Error | null>(null);
  const [messageStream, setMessageStream] = useState<any>(null);
  const messageStreamRef = useRef<any>(null);
  const messagePollingRef = useRef<any>(null);
  const [ourInboxId, setOurInboxId] = useState<string | null>(null);
  const [botInboxId, setBotInboxId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
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
        inspectConversation(conversation, 'Bot Conversation');
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
      
      // Load messages from this conversation
      try {
        console.log('Loading messages from conversation...');
        const messages = await conversation.messages();
        console.log(`Loaded ${messages.length} messages from conversation`);
        
        // Inspect a message if available to understand its structure
        if (messages.length > 0) {
          inspectMessage(messages[0], 'Sample Message');
        }
        
        // Process messages
        const processedMessages = [];
        
        for (const msg of messages) {
          try {
            // Determine if message is from bot based on XMTP message structure
            // In a DM, if the sender inbox ID matches the bot's inbox ID, it's from the bot
            const isFromBot = msg.senderInboxId === botInboxId;
            
            // Log message details for debugging
            console.log('Processing message:', {
              id: msg.id,
              senderAddress: msg.senderAddress,
              senderInboxId: msg.senderInboxId,
              isFromBot: isFromBot,
              isSentByUs: msg.senderInboxId === ourInboxId,
              timestamp: msg.sent
            });
            
            // Handle content that might be a Promise
            let resolvedContent = msg.content;
            if (resolvedContent instanceof Promise) {
              try {
                console.log(`Message ${msg.id} content is a Promise, resolving...`);
                resolvedContent = await resolvedContent;
                console.log(`Message ${msg.id} content resolved:`, resolvedContent);
              } catch (contentError) {
                console.error('Error resolving message content:', contentError);
                resolvedContent = 'Error: Could not load message content';
              }
            }
            
            // Determine message direction based on sender
            const direction = msg.senderInboxId === ourInboxId ? 'sent' : 'received';
            
            // Add the message to our array
            processedMessages.push({
              id: msg.id,
              content: resolvedContent,
              sender: isFromBot ? 'bot' : 'user',
              timestamp: msg.sent || new Date(),
              isBot: isFromBot,
              direction: direction,
              senderInboxId: msg.senderInboxId
            });
          } catch (formatError) {
            console.error('Error processing message:', formatError, msg);
          }
        }
        
        // Update state with processed messages
        setChatMessages(processedMessages);
        setSendStatus('Connected to bot');
        
        // Set up message stream for real-time updates
        try {
          console.log('Setting up message stream...');
          const stream = await conversation.streamMessages();
          setMessageStream(stream);
          
          // Register the message handler
          const onMessage = async (msg: any) => {
            console.log('New message received from stream:', msg);
            
            try {
              // Inspect the message to understand its structure
              inspectMessage(msg, 'Stream Message');
              
              // Determine if message is from bot based on XMTP message structure
              const isFromBot = msg.senderInboxId === botInboxId;
              
              // Log message details for debugging
              console.log('Stream message details:', {
                id: msg.id,
                senderAddress: msg.senderAddress,
                senderInboxId: msg.senderInboxId,
                isFromBot: isFromBot,
                isSentByUs: msg.senderInboxId === ourInboxId
              });
              
              // Handle content that might be a Promise
              let resolvedContent = msg.content;
              if (resolvedContent instanceof Promise) {
                try {
                  console.log(`Stream message ${msg.id} content is a Promise, resolving...`);
                  resolvedContent = await resolvedContent;
                  console.log(`Stream message ${msg.id} content resolved:`, resolvedContent);
                } catch (contentError) {
                  console.error('Error resolving stream message content:', contentError);
                  resolvedContent = 'Error: Could not load message content';
                }
              }
              
              // Determine message direction based on sender
              const direction = msg.senderInboxId === ourInboxId ? 'sent' : 'received';
              
              // Create a new message object
              const newMessage = {
                id: msg.id,
                content: resolvedContent,
                sender: isFromBot ? 'bot' : 'user',
                timestamp: msg.sent || new Date(),
                isBot: isFromBot,
                direction: direction,
                senderInboxId: msg.senderInboxId
              };
              
              // Check if this message is already in our state to avoid duplicates
              setChatMessages(prev => {
                // Check if we already have this message
                const isDuplicate = prev.some(existingMsg => existingMsg.id === msg.id);
                if (isDuplicate) {
                  console.log('Duplicate message detected in stream, skipping:', msg.id);
                  return prev;
                }
                
                console.log('Adding new message to UI:', newMessage);
                return [...prev, newMessage];
              });
            } catch (error) {
              console.error('Error processing stream message:', error);
            }
          };
          
          // Register the message handler with the stream
          stream.on('message', onMessage);
          
          // Set up cleanup function
          const cleanup = () => {
            console.log('Cleaning up message stream...');
            stream.off('message', onMessage);
            if (stream.close) {
              stream.close();
            }
          };
          
          // Store cleanup function for component unmount
          return cleanup;
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
      
      // Log the conversation we're using
      console.log('Sending message to bot using conversation:', botConversation);
      inspectConversation(botConversation, 'Sending to Conversation');
      
      // Set status to sending
      setSendStatus('Sending message...');
      
      // Create a user message to add to the UI immediately
      const userMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        content: messageText,
        sender: 'user',
        timestamp: new Date(),
        isBot: false,
        direction: 'sent'
      };
      
      // Add the user message to the UI
      setChatMessages(prev => [...prev, userMessage]);
      
      // Send the message to the bot
      console.log('Sending message to bot:', messageText);
      const sentMessage = await botConversation.send(messageText);
      
      // Inspect the sent message
      inspectMessage(sentMessage, 'Sent Message');
      
      // Update the user message in the UI with the actual message ID
      setChatMessages(prev => {
        return prev.map(msg => {
          if (msg.id === userMessage.id) {
            return {
              ...msg,
              id: sentMessage.id // Update with the real message ID
            };
          }
          return msg;
        });
      });
      
      // Set status to sent
      setSendStatus('Message sent');
      
      // If we're not using streaming, manually poll for the response
      if (!messageStream) {
        console.log('No message stream available, will poll for response');
        
        // Wait a moment for the bot to respond
        setTimeout(async () => {
          try {
            // Get the latest messages
            const latestMessages = await botConversation.messages();
            console.log(`Polled ${latestMessages.length} messages after sending`);
            
            // Get current message IDs for comparison
            const currentMessageIds = new Set(chatMessages.map((msg: any) => msg.id));
            
            // Find messages that we don't already have
            const newMessages = latestMessages.filter((msg: any) => !currentMessageIds.has(msg.id));
            
            if (newMessages.length > 0) {
              console.log(`Found ${newMessages.length} new messages after sending`);
              
              // Get our wallet address for comparison
              let ourWalletAddress = null;
              if (xmtp && xmtp.client) {
                const xmtpClient = xmtp.client as any;
                if (xmtpClient.address) {
                  ourWalletAddress = xmtpClient.address;
                }
              }
              
              // Process each new message
              for (const msg of newMessages) {
                try {
                  // Inspect the message
                  inspectMessage(msg, 'New Polled Message');
                  
                  // Determine if message is from bot based on XMTP message structure
                  const isFromBot = msg.senderAddress !== ourWalletAddress;
                  
                  // Log message details for debugging
                  console.log('Processing new polled message:', {
                    id: msg.id,
                    senderAddress: msg.senderAddress,
                    senderInboxId: msg.senderInboxId,
                    isFromBot: isFromBot
                  });
                  
                  // Handle content that might be a Promise
                  let resolvedContent = msg.content;
                  if (resolvedContent instanceof Promise) {
                    try {
                      console.log(`New message ${msg.id} content is a Promise, resolving...`);
                      resolvedContent = await resolvedContent;
                      console.log(`New message ${msg.id} content resolved:`, resolvedContent);
                    } catch (contentError) {
                      console.error('Error resolving new message content:', contentError);
                      resolvedContent = 'Error: Could not load message content';
                    }
                  }
                  
                  // Create a new message object
                  const newMessage = {
                    id: msg.id,
                    content: resolvedContent,
                    sender: isFromBot ? 'bot' : 'user',
                    timestamp: msg.sent || new Date(),
                    isBot: isFromBot,
                    direction: isFromBot ? 'received' : 'sent'
                  };
                  
                  // Check if this message is already in our state to avoid duplicates
                  setChatMessages(prev => {
                    // Check if we already have this message
                    const isDuplicate = prev.some(existingMsg => existingMsg.id === msg.id);
                    if (isDuplicate) {
                      console.log('Duplicate message detected in polling, skipping:', msg.id);
                      return prev;
                    }
                    
                    console.log('Adding new polled message to UI:', newMessage);
                    return [...prev, newMessage];
                  });
                } catch (error) {
                  console.error('Error processing new polled message:', error);
                }
              }
            }
          } catch (pollError) {
            console.error('Error polling for response:', pollError);
          }
        }, 2000); // Wait 2 seconds before polling
      }
    } catch (error) {
      console.error('Error sending message to bot:', error);
      setSendStatus(`Error sending message: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
  // Function to send an audio attachment
  const sendAudioAttachment = async (audioFile: File) => {
    if (!xmtp || !xmtp.client) {
      setSendStatus('Please connect to XMTP first');
      return;
    }
    
    try {
      setSendStatus('Preparing audio message...');
      
      // Load the attachment module
      const attachmentModule = await loadXmtpAttachmentModule();
      
      // Create a conversation if it doesn't exist
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
        // Generate a client-side ID for this message
        const clientGeneratedId = `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        
        // Read the file as an ArrayBuffer
        const arrayBuffer = await audioFile.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        
        // Create the attachment
        const attachment = {
          filename: audioFile.name,
          mimeType: audioFile.type,
          data: uint8Array
        };
        
        // Add the message to the local chat immediately for better UX
        const newMessage = {
          id: clientGeneratedId,
          clientGeneratedId,
          content: attachment,
          sender: 'user',
          timestamp: new Date(),
          isBot: false,
          direction: 'sent'
        };
        
        setChatMessages(prev => {
          // Check if this message already exists in our chat
          const messageExists = prev.some(msg => 
            msg.clientGeneratedId === clientGeneratedId
          );
          
          if (messageExists) {
            console.log('Message already exists in chat, not adding duplicate');
            return prev;
          }
          
          return [...prev, newMessage];
        });
        
        // Encode and send the attachment
        setSendStatus('Sending audio message...');
        const codec = new attachmentModule.AttachmentCodec();
        const encoded = await codec.encode(attachment);
        await conversation.send(encoded, attachmentModule.ContentTypeAttachment);
        
        console.log('Audio message sent successfully!');
        setSendStatus(null);
      }
    } catch (error) {
      console.error('Error sending audio message:', error);
      setSendStatus(`Error sending audio message: ${error instanceof Error ? error.message : String(error)}`);
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
  const renderMessageContent = (msg: any) => {
    try {
      const { content } = msg;
      
      // Handle null or undefined content
      if (content === null || content === undefined) {
        return <p className="text-sm text-red-400">Empty message</p>;
      }
      
      // Special case: Check for Promise content (shouldn't happen but just in case)
      if (content && typeof content.then === 'function') {
        return <p className="text-sm text-yellow-400">Loading message content...</p>;
      }
      
      // Check if this is an audio attachment
      if (isAudioAttachment(content)) {
        try {
          // For XMTP attachment format structure
          if (content && content.type && 
              content.type.authorityId === 'xmtp.org' && 
              content.type.typeId === 'attachment') {
            
            // Extract parameters and content from XMTP attachment format
            const { parameters, content: attachmentContent } = content;
            const mimeType = parameters?.mimeType || 'audio/mpeg';
            const filename = parameters?.filename || 'Audio message';
            
            console.log('Processing XMTP attachment format:', {
              filename,
              mimeType,
              contentSize: attachmentContent ? (
                attachmentContent instanceof Uint8Array ? 
                  attachmentContent.length : 
                  'Non-Uint8Array content'
              ) : 'No content'
            });
            
            // Create audio blob if we have binary content
            let audioUrl = '';
            if (attachmentContent && attachmentContent instanceof Uint8Array) {
              audioUrl = URL.createObjectURL(new Blob([attachmentContent], { type: mimeType }));
            }
            
            if (audioUrl) {
              return (
                <AudioMessage 
                  src={audioUrl} 
                  filename={filename} 
                  isOwnMessage={msg.sender !== 'bot'}
                />
              );
            }
            
            // If we don't have binary content but have a fallback message
            if (content.fallback) {
              return (
                <div>
                  <p className="text-sm text-amber-400">Audio attachment available but cannot be played</p>
                  <p className="text-xs text-gray-400">{content.fallback}</p>
                </div>
              );
            }
          }
          
          // Traditional attachment format handling
          const audioContent = typeof content === 'string' 
            ? JSON.parse(content) 
            : content;
          
          // Create safe audio URL
          const audioUrl = audioContent.url || 
            (audioContent.data ? URL.createObjectURL(new Blob([audioContent.data], { type: audioContent.mimeType || 'audio/mpeg' })) : '');
          
          if (!audioUrl) {
            return <p className="text-sm text-red-400">Invalid audio attachment</p>;
          }
          
          return (
            <AudioMessage 
              src={audioUrl} 
              filename={audioContent.filename || 'Audio message'} 
              isOwnMessage={msg.sender !== 'bot'}
            />
          );
        } catch (audioError) {
          console.error('Error rendering audio message:', audioError);
          return <p className="text-sm text-red-400">Error displaying audio message</p>;
        }
      }
      
      // Handle string content (most common case)
      if (typeof content === 'string') {
        if (!content.trim()) {
          return <p className="text-sm text-gray-400">[Empty message]</p>;
        }
        return <p className="text-sm whitespace-pre-wrap break-words">{content}</p>;
      }
      
      // If content is an object but not an attachment, extract text or stringify it
      if (typeof content === 'object' && content !== null) {
        // Extract text content from common properties, checking each property
        const textProperties = ['content', 'text', 'message', 'value', 'body', 'data', 'description'];
        
        for (const prop of textProperties) {
          if (content[prop] && typeof content[prop] === 'string') {
            return <p className="text-sm whitespace-pre-wrap break-words">{content[prop]}</p>;
          }
        }
        
        // Handle system messages
        if (content.initiatedByInboxId || content.systemMessage || content.type === 'system') {
          const systemText = content.text || content.message || content.body || 'System message';
          return <p className="text-sm italic text-gray-400">{systemText}</p>;
        }
        
        // For arrays, try to join items if they're strings
        if (Array.isArray(content)) {
          if (content.length === 0) {
            return <p className="text-sm text-gray-400">[Empty array]</p>;
          }
          
          if (content.every(item => typeof item === 'string')) {
            return <p className="text-sm whitespace-pre-wrap break-words">{content.join(', ')}</p>;
          }
        }
        
        // Last resort: stringify the object safely, avoiding circular references
        try {
          const cache: any[] = [];
          const stableStringify = (obj: any): string => {
            return JSON.stringify(obj, (key, value) => {
              if (typeof value === 'object' && value !== null) {
                if (cache.includes(value)) return '[Circular]';
                cache.push(value);
              }
              return value;
            }, 2);
          };
          
          const stringified = stableStringify(content);
          if (stringified === '{}') {
            return <p className="text-sm text-gray-400">[Empty object]</p>;
          }
          
          return <p className="text-sm font-mono text-xs whitespace-pre-wrap break-words overflow-x-auto">{stringified}</p>;
        } catch (stringifyError) {
          console.error('Error stringifying object:', stringifyError);
          return <p className="text-sm text-red-400">Complex object (cannot display)</p>;
        }
      }
      
      // Fallback for other types
      return <p className="text-sm text-gray-400">[Unsupported content type: {typeof content}]</p>;
    } catch (error) {
      console.error('Error in renderMessageContent:', error);
      return <p className="text-sm text-red-400">Error displaying message</p>;
    }
  };
  
  // Clean up message stream when component unmounts
  useEffect(() => {
    return () => {
      if (messageStream) {
        console.log('Cleaning up message stream');
        try {
          if (typeof messageStream.off === 'function') {
            messageStream.off('message');
          }
          if (typeof messageStream.close === 'function') {
            messageStream.close();
          }
        } catch (error) {
          console.error('Error cleaning up message stream:', error);
        }
      }
    };
  }, [messageStream]);
  
  // Clean up on unmount or when dependencies change
  useEffect(() => {
    return () => {
      // Clear polling interval if exists
      if (messagePollingRef.current) {
        console.log('Cleaning up message polling interval');
        clearInterval(messagePollingRef.current);
        messagePollingRef.current = null;
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
              className={`flex ${msg.direction === 'received' ? 'justify-start' : 'justify-end'}`}
            >
              <div 
                className={`max-w-[80%] rounded-lg px-3 py-2 ${
                  msg.direction === 'received' 
                    ? 'bg-neutral-700 text-white' 
                    : 'bg-indigo-600 text-white'
                }`}
              >
                {renderMessageContent(msg)}
                <p className="text-xs opacity-70 mt-1">
                  {formatMessageTime(msg.timestamp)}
                  {msg.isBot && <span className="ml-2 text-xs text-blue-300">[Bot]</span>}
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
            onSendAudio={sendAudioAttachment}
            placeholder={t('chat.placeholder')}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 