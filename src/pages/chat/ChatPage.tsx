import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft } from '@phosphor-icons/react';
// import { Gear } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';
import AudioMessage from '../../components/AudioMessage';
// Import the attachment helper
import { loadXmtpAttachmentModule } from '../../utils/xmtpAttachmentHelper';

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
  const [messageStream, setMessageStream] = useState<any>(null);
  
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
      console.log('XMTP connected, loading bot conversation');
      setSendStatus('Loading conversation with Scarlett bot...');
      
      // Get our wallet address and inbox ID for comparison
      let ourInboxId = null;
      try {
        const xmtpClient = xmtp.client;
        // Use type assertion for client properties
        console.log('Our wallet address:', (xmtpClient as any).address);
        
        if ((xmtpClient as any).inboxId) {
          ourInboxId = (xmtpClient as any).inboxId;
          console.log('Our inbox ID:', ourInboxId);
        }
      } catch (error) {
        console.log('Could not get our inbox ID:', error);
      }
      
      // Check if attachment codec is registered
      let attachmentCodecPresent = false;
      try {
        // Try to access the codec via different methods depending on the SDK version
        const client = xmtp.client as any;
        
        // Method 1: Check contentTypeRegistry first
        if (client.contentTypeRegistry && typeof client.contentTypeRegistry.codecFor === 'function') {
          const codec = client.contentTypeRegistry.codecFor({
            toString: () => 'xmtp.org/attachment:1.0',
            sameAs: (other: any) => other.toString() === 'xmtp.org/attachment:1.0'
          });
          attachmentCodecPresent = !!codec;
          console.log('Attachment codec found in contentTypeRegistry:', attachmentCodecPresent);
        } 
        // Method 2: Check codecs array if exists
        else if (client.codecs && Array.isArray(client.codecs)) {
          attachmentCodecPresent = client.codecs.some((codec: any) => 
            codec.contentType === 'xmtp.org/attachment:1.0');
          console.log('Attachment codec found in codecs array:', attachmentCodecPresent);
        }
        
        if (!attachmentCodecPresent) {
          console.warn('Attachment codec not registered yet. Messages with attachments may fail to load.');
        }
      } catch (error) {
        console.warn('Error checking for attachment codec:', error);
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
        let messages = [];
        try {
          if (!attachmentCodecPresent) {
            console.warn('Loading messages without attachment codec. Some messages may fail to load.');
          }
          
          messages = await conversation.messages();
          console.log(`Loaded ${messages.length} messages from conversation`);
        } catch (codecError: unknown) {
          // Check if this is a codec error
          if (codecError instanceof Error && codecError.message.includes('Codec not found')) {
            console.error('Error loading messages due to missing codec:', codecError);
            
            // Try to register the codec manually as a last resort
            try {
              // Late import the module to register it directly
              const { AttachmentCodec, RemoteAttachmentCodec } = await import('@xmtp/content-type-remote-attachment');
              
              if (xmtp.client && typeof (xmtp.client as any).registerCodec === 'function') {
                console.log('Attempting emergency codec registration...');
                (xmtp.client as any).registerCodec(new AttachmentCodec());
                (xmtp.client as any).registerCodec(new RemoteAttachmentCodec());
                
                // Backup approach: if client has a codecFor method that's failing, let's try to patch it
                if ((xmtp.client as any).codecFor) {
                  console.log('Patching codecFor method as emergency fallback');
                  const originalCodecFor = (xmtp.client as any).codecFor;
                  
                  // Create patched version that handles missing codecs
                  (xmtp.client as any).codecFor = function(contentType: any) {
                    try {
                      // Try the original method first
                      return originalCodecFor.call(this, contentType);
                    } catch (error) {
                      console.warn('CodecFor error, using fallback:', error);
                      
                      // Handle attachment content types
                      const contentTypeStr = contentType?.toString() || '';
                      if (contentTypeStr.includes('attachment:1.0')) {
                        console.log('Using fallback attachment codec');
                        return new AttachmentCodec();
                      }
                      if (contentTypeStr.includes('remote-attachment:1.0')) {
                        console.log('Using fallback remote attachment codec');
                        return new RemoteAttachmentCodec();
                      }
                      
                      // Re-throw for other codec types
                      throw error;
                    }
                  };
                }
                
                // Try loading messages again
                console.log('Retrying message load after emergency codec registration');
                messages = await conversation.messages();
                console.log(`Successfully loaded ${messages.length} messages after codec registration`);
              } else {
                // Fall back to empty messages
                console.warn('Cannot register codec: registerCodec method not available');
                setSendStatus('Connected to bot, but could not load messages with attachments. Continuing with empty message list.');
                messages = []; // Continue with empty messages
              }
            } catch (emergencyError) {
              console.error('Emergency codec registration failed:', emergencyError);
              setSendStatus('Connected to bot, but could not load messages with attachments. Continuing with empty message list.');
              messages = []; // Continue with empty messages
            }
          } else {
            // Not a codec error, might be something else
            throw codecError;
          }
        }
        
        // Create a local array to accumulate formatted messages
        const processedMessages: any[] = [];
        
        // Process messages one by one to await content promises
        for (const msg of messages) {
          try {
            // Log basic message info for debugging (without content that might be a Promise)
            console.log('Processing message:', {
              id: msg.id,
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
            const isFromBot = isBotMessage(msg, botInboxId);
            
            // Handle content which might be a Promise
            let resolvedContent;
            try {
              // Check if content is a Promise and await it
              if (msg.content && typeof msg.content.then === 'function') {
                console.log('Message content is a Promise, resolving...');
                resolvedContent = await msg.content;
                console.log('Resolved content:', resolvedContent);
              } else {
                resolvedContent = msg.content;
              }
            } catch (contentError) {
              console.error('Error resolving message content:', contentError);
              resolvedContent = 'Error: Could not load message content';
            }
            
            // Add the formatted message to our array
            processedMessages.push({
              id: msg.id,
              content: resolvedContent,
              sender: isFromBot ? 'bot' : 'user',
              timestamp: msg.sent || new Date()
            });
          } catch (formatError) {
            console.error('Error formatting message:', formatError, msg);
            // Add a placeholder for messages we can't format
            processedMessages.push({
              id: msg.id || Date.now().toString(),
              content: 'Error displaying message',
              sender: 'user', // Default to user if we can't determine
              timestamp: new Date()
            });
          }
        }
        
        // Show all messages
        setChatMessages(processedMessages);
        setSendStatus(null);
      } catch (messagesError) {
        console.error('Error loading messages:', messagesError);
        setChatMessages([]);
        setSendStatus('Connected to bot, but could not load previous messages');
      }
      
      // Set up message stream
      try {
        if (conversation.streamMessages) {
          const stream = await conversation.streamMessages();
          setMessageStream(stream);
          
          // Register the message handler
          const onMessage = async (msg: any) => {
            console.log('New message received:', msg);
            
            try {
              // Determine if message is from bot
              const isFromBot = isBotMessage(msg, botInboxId);
              
              // Handle content which might be a Promise
              let resolvedContent;
              try {
                // Check if content is a Promise and await it
                if (msg.content && typeof msg.content.then === 'function') {
                  console.log('Stream message content is a Promise, resolving...');
                  resolvedContent = await msg.content;
                  console.log('Resolved stream message content:', resolvedContent);
                } else {
                  resolvedContent = msg.content;
                }
              } catch (contentError) {
                console.error('Error resolving stream message content:', contentError);
                resolvedContent = 'Error: Could not load message content';
              }
              
              // Format the message
              const formattedMessage = {
                id: msg.id,
                content: resolvedContent,
                sender: isFromBot ? 'bot' : 'user',
                timestamp: msg.sent || new Date()
              };
              
              // Add to chat messages
              setChatMessages(prev => [...prev, formattedMessage]);
            } catch (error) {
              console.error('Error processing new message:', error);
            }
          };
          
          // Register the message handler
          stream.on('message', onMessage);
          
          // Return cleanup function
          return () => {
            if (stream.off) {
              stream.off('message', onMessage);
            }
            if (stream.close) {
              stream.close();
            }
          };
        } else {
          console.warn('Conversation does not support streaming messages');
        }
      } catch (streamError) {
        console.error('Error setting up message stream:', streamError);
      }
    } catch (error) {
      console.error('Error loading bot conversation:', error);
      setSendStatus(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  
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
      if (typeof content === 'string') {
        const parsedContent = JSON.parse(content);
        return (
          parsedContent &&
          parsedContent.mimeType &&
          parsedContent.mimeType.startsWith('audio/')
        );
      }
      return content && content.mimeType && content.mimeType.startsWith('audio/');
    } catch (e) {
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
          const safeStringify = (obj: any): string => {
            return JSON.stringify(obj, (key, value) => {
              if (typeof value === 'object' && value !== null) {
                if (cache.includes(value)) return '[Circular]';
                cache.push(value);
              }
              return value;
            }, 2);
          };
          
          const stringified = safeStringify(content);
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
                {renderMessageContent(msg)}
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
            onSendAudio={sendAudioAttachment}
            placeholder={t('chat.placeholder')}
          />
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 