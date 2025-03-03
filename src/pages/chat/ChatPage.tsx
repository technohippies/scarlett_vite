import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { CaretLeft, Gear } from '@phosphor-icons/react';
// import { Gear } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';
import ChatInput from '../../components/chat/ChatInput';
import PageHeader from '../../components/layout/PageHeader';
import AudioMessage from '../../components/AudioMessage';
// Import the attachment helper
import { loadXmtpAttachmentModule } from '../../utils/xmtpAttachmentHelper';

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

// Update the isBotMessage function with improved bot detection
const isBotMessage = (message: any, recipientAddressOrInboxId?: string): boolean => {
  try {
    // Check if the message has explicit bot flag
    if (message.isBot === true) {
      return true;
    }
    
    // If the message has a direction, use that
    if (message.direction === 'received') {
      return true;
    }
    
    // If the message has a sender field, use that
    if (message.sender === 'bot') {
      return true;
    }
    
    // If we have the sender address and recipient address, check if they're different
    if (message.senderAddress && recipientAddressOrInboxId) {
      // Safer comparison that handles string or null
      const senderAddr = String(message.senderAddress).toLowerCase();
      const recipientAddr = String(recipientAddressOrInboxId).toLowerCase();
      return senderAddr !== recipientAddr;
    }
    
    // Additional checks for inbox ID if available
    if (message.senderInboxId && message.ourInboxId) {
      return message.senderInboxId !== message.ourInboxId;
    }
    
    // Check if this looks like an auto-response message (messages sent by bots often have this pattern)
    // For text messages with typical AI response patterns
    if (typeof message.content === 'string') {
      const content = message.content.trim();
      // Some heuristics for detecting bot responses
      if (
        // Starts with greeting patterns
        content.match(/^(hi|hello|hey|greetings|howdy)/i) ||
        // Contains typical bot disclaimer patterns
        content.includes("I'm an AI") ||
        content.includes("I am an AI") ||
        content.includes("As an AI")
      ) {
        return true;
      }
    }
    
    // Default to false if we can't determine
    return false;
  } catch (error) {
    console.warn('Error in isBotMessage:', error);
    return false;
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
          
          // Emergency codec registration
          console.log('Attempting emergency codec registration...');
          try {
            // Late import the attachment modules
            const xmtpAttachmentHelper = await import('../../utils/xmtpAttachmentHelper');
            const attachmentModule = await xmtpAttachmentHelper.loadXmtpAttachmentModule();
            
            if (attachmentModule && attachmentModule.AttachmentCodec && attachmentModule.RemoteAttachmentCodec) {
              console.log('Attachment module loaded, registering codecs...');
              
              // Method 1: Try registering via contentTypeRegistry if available
              if (client.contentTypeRegistry && typeof client.contentTypeRegistry.register === 'function') {
                const AttachmentCodec = attachmentModule.AttachmentCodec;
                const RemoteAttachmentCodec = attachmentModule.RemoteAttachmentCodec;
                
                try {
                  client.contentTypeRegistry.register(new AttachmentCodec());
                  client.contentTypeRegistry.register(new RemoteAttachmentCodec());
                  console.log('Emergency codec registration successful via contentTypeRegistry');
                } catch (regError) {
                  console.warn('Failed to register codecs via contentTypeRegistry:', regError);
                }
              }
              
              // Method 2: Patch the codecFor method as a fallback
              if (client.contentTypeRegistry && typeof client.contentTypeRegistry.codecFor === 'function') {
                const originalCodecFor = client.contentTypeRegistry.codecFor;
                let isHandlingCodecError = false;
                
                client.contentTypeRegistry.codecFor = function(contentType: any) {
                  // Prevent infinite recursion
                  if (isHandlingCodecError) {
                    return null;
                  }
                  
                  try {
                    const codec = originalCodecFor.call(this, contentType);
                    if (codec) return codec;
                    
                    // Only handle specific content types if codec is not found
                    const contentTypeStr = contentType.toString();
                    if (contentTypeStr === 'xmtp.org/attachment:1.0') {
                      console.log('Providing fallback AttachmentCodec');
                      return new attachmentModule.AttachmentCodec();
                    } else if (contentTypeStr === 'xmtp.org/remote-attachment:1.0') {
                      console.log('Providing fallback RemoteAttachmentCodec');
                      return new attachmentModule.RemoteAttachmentCodec();
                    }
                    return null;
                  } catch (error) {
                    console.warn('Error in patched codecFor:', error);
                    
                    // Handle errors with fallback
                    isHandlingCodecError = true;
                    try {
                      const contentTypeStr = contentType.toString();
                      if (contentTypeStr === 'xmtp.org/attachment:1.0') {
                        console.log('Providing fallback AttachmentCodec after error');
                        return new attachmentModule.AttachmentCodec();
                      } else if (contentTypeStr === 'xmtp.org/remote-attachment:1.0') {
                        console.log('Providing fallback RemoteAttachmentCodec after error');
                        return new attachmentModule.RemoteAttachmentCodec();
                      }
                    } finally {
                      isHandlingCodecError = false;
                    }
                    return null;
                  }
                };
                console.log('Patched codecFor method to handle attachment content types');
              }
              
              console.log('Retrying to load messages after emergency codec registration');
            }
          } catch (emergencyError) {
            console.error('Failed emergency codec registration:', emergencyError);
          }
        }
      } catch (error) {
        console.warn('Error checking for attachment codec:', error);
      }
      
      // Use the createBotConversation method to ensure we always use the same conversation
      const conversation = await xmtp.createBotConversation();
      console.log('Got conversation with Scarlett bot:', conversation);
      
      // Try to get the bot's inbox ID from the conversation if available
      let botInboxId: string | null = null;
      let ourWalletAddress: string | null = null;
      try {
        // Get our wallet address first
        if (xmtp && xmtp.client) {
          const xmtpClient = xmtp.client as any;
          if (xmtpClient.address) {
            ourWalletAddress = xmtpClient.address;
            console.log('Our wallet address:', ourWalletAddress);
          }
          
          if (xmtpClient.inboxId) {
            console.log('Our inbox ID:', xmtpClient.inboxId);
          }
        }
        
        // Then get bot details from conversation
        if (conversation.peerInboxId) {
          botInboxId = conversation.peerInboxId;
          console.log('Bot inbox ID:', botInboxId);
        } else if (conversation.peerAddress) {
          // Use peerAddress as fallback for botInboxId
          botInboxId = conversation.peerAddress;
          console.log('Using bot peer address as ID:', botInboxId);
        }
        
        // Hard-coded bot addresses if needed
        // Add known bot addresses here as a last resort
        const KNOWN_BOT_ADDRESSES = [
          // Add the bot inbox ID we see in the logs
          '67e948e03dfd2842b5302872f49734e338a21b0db60816ab56bd16fad40dfe16'
        ];
        
        // Log all details for debugging
        console.log('Conversation details for bot identification:', {
          id: conversation.id,
          topic: conversation.topic,
          peerAddress: conversation.peerAddress,
          peerInboxId: conversation.peerInboxId,
          recipientAddress: conversation.recipientAddress,
          ourWalletAddress: ourWalletAddress,
          botInboxId: botInboxId,
          knownBotAddresses: KNOWN_BOT_ADDRESSES
        });
        
        // Enhanced fallback mechanism
        if (!botInboxId && KNOWN_BOT_ADDRESSES.length > 0) {
          console.warn('Using known bot address from hard-coded list');
          botInboxId = KNOWN_BOT_ADDRESSES[0];
        }
        
        // Use topic as a last resort if it contains information
        if (!botInboxId && conversation.topic) {
          const parts = conversation.topic.split('/');
          // In some XMTP implementations, the topic might contain the peer address
          if (parts.length > 1) {
            const potentialAddresses = parts.filter((part: string) => 
              part.length > 30 && /^[0-9a-fA-F]+$/.test(part));
            
            if (potentialAddresses.length > 0) {
              // Find the address that's not our address
              const otherAddress = potentialAddresses.find((addr: string) => 
                !ourWalletAddress || addr.toLowerCase() !== ourWalletAddress.toLowerCase());
              
              if (otherAddress) {
                botInboxId = otherAddress;
                console.log('Extracted potential bot address from topic:', botInboxId);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Error getting bot inbox ID:', error);
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
        
        // Process the messages to create UI-friendly format
        const processedMessages: any[] = [];
        // Create a map to track seen messages by content hash
        const seenMessageHashes = new Map<string, boolean>();
        
        for (const msg of messages) {
          try {
            console.log('Processing message:', {
              id: msg.id,
              senderAddress: msg.senderAddress,
              timestamp: msg.sent,
              hasContent: !!msg.content
            });
            
            // Determine if from bot using enhanced logic
            const isFromBot = (
              // First check explicit flags
              msg.isBot === true || 
              msg.direction === 'received' || 
              msg.sender === 'bot' || 
              // Then check if the message is NOT from our address (if we have both addresses)
              (ourWalletAddress && msg.senderAddress && 
               msg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()) ||
              // Check against botInboxId if available
              (botInboxId && msg.senderAddress && 
               (msg.senderAddress.toLowerCase() === botInboxId.toLowerCase())) ||
              // Check sender inbox ID against botInboxId
              (botInboxId && msg.senderInboxId && msg.senderInboxId === botInboxId) ||
              // Use the enhanced isBotMessage helper with proper params
              isBotMessage(msg, ourWalletAddress || undefined)
            );
            
            // Add detailed logging for message direction determination
            console.log('Enhanced message direction determination:', {
              id: msg.id,
              senderInboxId: msg.senderInboxId,
              senderAddress: msg.senderAddress,
              botInboxId: botInboxId,
              ourWalletAddress: ourWalletAddress,
              explicitFlags: {
                isBot: msg.isBot === true,
                direction: msg.direction === 'received',
                sender: msg.sender === 'bot'
              },
              addressCheck: (ourWalletAddress && msg.senderAddress && 
                             msg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()),
              botInboxCheck: (botInboxId && msg.senderAddress && 
                             (msg.senderAddress.toLowerCase() === botInboxId.toLowerCase())),
              senderInboxCheck: (botInboxId && msg.senderInboxId && msg.senderInboxId === botInboxId),
              fallbackCheck: (msg.senderInboxId && ourWalletAddress && msg.senderInboxId !== ourWalletAddress),
              finalDecision: isFromBot
            });
            
            // Handle content that might be a Promise
            let resolvedContent = msg.content;
            
            // Await Promise content
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
            
            // Generate a content hash to detect duplicate messages
            let contentHash = '';
            try {
              // If we have attachment format, create hash based on filename, mimeType and contentSize
              if (
                typeof resolvedContent === 'object' && 
                resolvedContent?.type?.authorityId === 'xmtp.org' && 
                resolvedContent?.type?.typeId === 'attachment' &&
                resolvedContent?.parameters
              ) {
                const { filename, mimeType, contentSize } = resolvedContent.parameters;
                contentHash = `${filename}:${mimeType}:${contentSize}:${isFromBot}`;
              } else if (typeof resolvedContent === 'string') {
                // For text messages, use the content directly
                contentHash = `${resolvedContent}:${isFromBot}`;
              } else if (resolvedContent && typeof resolvedContent === 'object') {
                // For other objects, use a JSON representation
                // Use a more stable approach to stringify objects
                const stableJsonString = stableStringify(resolvedContent);
                contentHash = `${stableJsonString}:${isFromBot}`;
              }
              
              // Skip duplicate messages with the same content
              if (contentHash && seenMessageHashes.has(contentHash)) {
                console.log(`Skipping duplicate message with content hash: ${contentHash}`);
                continue;
              }
              
              // Mark this content hash as seen
              if (contentHash) {
                seenMessageHashes.set(contentHash, true);
              }
            } catch (hashError) {
              console.warn('Error generating content hash:', hashError);
              // Continue processing even if hash generation fails
            }
            
            // Add the formatted message to our array with a truly unique ID that always includes randomness
            const uniqueTimestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 10);
            processedMessages.push({
              id: `${uniqueTimestamp}-${randomSuffix}-${msg.id}${contentHash ? `-${contentHash}` : ''}`,
              content: resolvedContent,
              sender: isFromBot ? 'bot' : 'user',
              timestamp: msg.sent || new Date(),
              isBot: isFromBot,
              direction: isFromBot ? 'received' : 'sent'
            });
          } catch (formatError) {
            console.error('Error formatting message:', formatError, msg);
            // Add a placeholder for messages we can't format with a unique ID
            const uniqueTimestamp = Date.now();
            const randomSuffix = Math.random().toString(36).substring(2, 10);
            processedMessages.push({
              id: `${uniqueTimestamp}-${randomSuffix}-error-${msg.id || 'unknown'}`,
              content: 'Error displaying message',
              sender: 'user', // Default to user if we can't determine
              timestamp: new Date(),
              isBot: false,
              direction: 'sent'
            });
          }
        }
        
        // Show all messages
        setChatMessages(processedMessages);
        setSendStatus(null);
        
        // Set up polling for new messages
        if (messagePollingRef.current) {
          clearInterval(messagePollingRef.current);
          messagePollingRef.current = null;
        }
        
        // Set up polling for new messages
        const pollInterval = 3000; // 3 seconds
        console.log(`Setting up polling for new messages every ${pollInterval}ms`);
        
        const polling = setInterval(async () => {
          try {
            if (conversation) {
              // Get the latest messages
              const latestMessages = await conversation.messages();
              
              // Get current message IDs and content hashes for comparison
              const currentMessageIds = new Set(chatMessages.map((msg: any) => msg.id));
              // Also track content hashes to avoid duplicates with same content but different IDs
              const currentContentHashes = new Map<string, boolean>();
              
              // Process each message in the current chat to extract content hashes
              chatMessages.forEach((msg: any) => {
                try {
                  // Extract content hash from message ID if it exists (from our new format id: `${msg.id}-${contentHash}`)
                  const parts = msg.id.split('-');
                  if (parts.length > 1) {
                    // Assume the first part is the original ID and the rest is our content hash
                    const contentHashPart = parts.slice(1).join('-');
                    if (contentHashPart) {
                      currentContentHashes.set(contentHashPart, true);
                    }
                  }
                  
                  // Also try to generate a content hash from the message content
                  let contentHash = '';
                  const content = msg.content;
                  
                  if (
                    typeof content === 'object' && 
                    content?.type?.authorityId === 'xmtp.org' && 
                    content?.type?.typeId === 'attachment' &&
                    content?.parameters
                  ) {
                    const { filename, mimeType, contentSize } = content.parameters;
                    contentHash = `${filename}:${mimeType}:${contentSize}:${msg.isBot}`;
                  } else if (typeof content === 'string') {
                    contentHash = `${content}:${msg.isBot}`;
                  } else if (content && typeof content === 'object') {
                    contentHash = `${JSON.stringify(content)}:${msg.isBot}`;
                  }
                  
                  if (contentHash) {
                    currentContentHashes.set(contentHash, true);
                  }
                } catch (hashError) {
                  console.warn('Error processing existing message for hash:', hashError);
                }
              });
              
              // Find messages that we don't already have
              const newMessages = latestMessages.filter((msg: any) => !currentMessageIds.has(msg.id));
              
              if (newMessages.length > 0) {
                console.log(`Found ${newMessages.length} new messages during polling`);
                
                // Update our reference to all messages
                messages = latestMessages;
                
                // Process each new message
                for (const newMsg of newMessages) {
                  try {
                    console.log('Processing new message from polling:', {
                      id: newMsg.id, 
                      senderAddress: newMsg.senderAddress,
                      senderInboxId: newMsg.senderInboxId
                    });
                    
                    // Improved bot message detection with explicit debugging log
                    const isFromBot = (
                      // Check for explicit bot flags
                      newMsg.isBot === true || 
                      newMsg.direction === 'received' || 
                      newMsg.sender === 'bot' || 
                      // Check if the message is NOT from our address (if we have both addresses)
                      (ourWalletAddress && newMsg.senderAddress && 
                       newMsg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()) ||
                      // Check against botInboxId if available
                      (botInboxId && newMsg.senderAddress && 
                       (newMsg.senderAddress.toLowerCase() === botInboxId.toLowerCase())) ||
                      // Check sender inbox ID against botInboxId
                      (botInboxId && newMsg.senderInboxId && newMsg.senderInboxId === botInboxId) ||
                      // Use the isBotMessage helper as fallback with additional detection
                      isBotMessage(newMsg, ourWalletAddress || undefined)
                    );
                    
                    // Add detailed logging for debugging
                    console.log('Enhanced polling message direction determination:', {
                      id: newMsg.id,
                      senderInboxId: newMsg.senderInboxId,
                      senderAddress: newMsg.senderAddress,
                      botInboxId: botInboxId,
                      ourWalletAddress: ourWalletAddress,
                      explicitFlags: {
                        isBot: newMsg.isBot === true,
                        direction: newMsg.direction === 'received',
                        sender: newMsg.sender === 'bot'
                      },
                      addressCheck: (ourWalletAddress && newMsg.senderAddress && 
                                    newMsg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()),
                      botInboxCheck: (botInboxId && newMsg.senderAddress && 
                                    (newMsg.senderAddress.toLowerCase() === botInboxId.toLowerCase())),
                      senderInboxCheck: (botInboxId && newMsg.senderInboxId && newMsg.senderInboxId === botInboxId),
                      isBotMessageHelperResult: isBotMessage(newMsg, ourWalletAddress || undefined),
                      finalDecision: isFromBot
                    });
                    
                    // Handle content that might be a Promise
                    let resolvedContent = newMsg.content;
                    
                    if (resolvedContent instanceof Promise) {
                      try {
                        console.log(`New message ${newMsg.id} content is a Promise, resolving...`);
                        resolvedContent = await resolvedContent;
                        console.log(`New message ${newMsg.id} content resolved:`, resolvedContent);
                      } catch (contentError) {
                        console.error('Error resolving new message content:', contentError);
                        resolvedContent = 'Error: Could not load message content';
                      }
                    }
                    
                    // Generate a content hash to detect duplicate messages
                    let contentHash = '';
                    try {
                      // If we have attachment format, create hash based on filename, mimeType and contentSize
                      if (
                        typeof resolvedContent === 'object' && 
                        resolvedContent?.type?.authorityId === 'xmtp.org' && 
                        resolvedContent?.type?.typeId === 'attachment' &&
                        resolvedContent?.parameters
                      ) {
                        const { filename, mimeType, contentSize } = resolvedContent.parameters;
                        contentHash = `${filename}:${mimeType}:${contentSize}:${isFromBot}`;
                      } else if (typeof resolvedContent === 'string') {
                        // For text messages, use the content directly
                        contentHash = `${resolvedContent}:${isFromBot}`;
                      } else if (resolvedContent && typeof resolvedContent === 'object') {
                        // For other objects, use a JSON representation
                        // Use a more stable approach to stringify objects
                        const stableJsonString = stableStringify(resolvedContent);
                        contentHash = `${stableJsonString}:${isFromBot}`;
                      }
                      
                      // Skip duplicate messages with the same content
                      if (contentHash && currentContentHashes.has(contentHash)) {
                        console.log(`Skipping duplicate new message with content hash: ${contentHash}`);
                        continue;
                      }
                    } catch (hashError) {
                      console.warn('Error generating content hash for new message:', hashError);
                      // Continue processing even if hash generation fails
                    }
                    
                    // Create the formatted message with unique ID
                    const uniqueTimestamp = Date.now();
                    const randomSuffix = Math.random().toString(36).substring(2, 10);
                    const formattedMessage = {
                      id: `${uniqueTimestamp}-${randomSuffix}-${newMsg.id}${contentHash ? `-${contentHash}` : ''}`,
                      content: resolvedContent,
                      sender: isFromBot ? 'bot' : 'user',
                      timestamp: newMsg.sent || new Date(),
                      isBot: isFromBot,
                      direction: isFromBot ? 'received' : 'sent'
                    };
                    
                    console.log('Adding new message to UI:', {
                      id: formattedMessage.id,
                      isBot: formattedMessage.isBot,
                      direction: formattedMessage.direction
                    });
                    
                    // Add to the UI
                    setChatMessages(prev => {
                      // Check for duplicates using message content hash or direct comparison
                      const msgIsDuplicate = prev.some(existingMsg => {
                        // Extract content hash from ID if it exists
                        const parts = existingMsg.id.split('-');
                        // With our new format, content hash would be after the original message ID
                        // Format is now: timestamp-randomSuffix-msgId-contentHash
                        if (parts.length > 3 && contentHash) {
                          // Get all parts after the message ID as potential content hash
                          const existingContentHash = parts.slice(3).join('-');
                          if (existingContentHash === contentHash) {
                            console.log('Duplicate message detected in polling by content hash, skipping');
                            return true;
                          }
                        }
                        
                        // Also check the original message ID (third part of our format)
                        if (parts.length > 2 && parts[2] === newMsg.id) {
                          console.log('Duplicate message detected in polling by ID, skipping');
                          return true;
                        }
                        
                        // Also compare raw content as fallback
                        try {
                          const existingContent = existingMsg.content;
                          if (
                            typeof existingContent === 'object' && 
                            typeof resolvedContent === 'object' &&
                            JSON.stringify(existingContent) === JSON.stringify(resolvedContent)
                          ) {
                            console.log('Duplicate message detected by content comparison, skipping');
                            return true;
                          }
                        } catch (compareError) {
                          console.warn('Error comparing message contents:', compareError);
                        }
                        
                        return false;
                      });
                      
                      if (msgIsDuplicate) {
                        console.log('Skipping duplicate message in polling');
                        return prev; // Don't add duplicate
                      }
                      
                      // If we get here, it's not a duplicate, so add it
                      return [...prev, formattedMessage];
                    });
                  } catch (newMsgError) {
                    console.error('Error processing new message:', newMsgError);
                  }
                }
              }
            }
          } catch (pollError) {
            console.error('Error polling for new messages:', pollError);
          }
        }, pollInterval);
        
        // Store polling reference for cleanup
        messagePollingRef.current = polling;
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
              // Determine if message is from bot using enhanced detection logic
              const isFromBot = (
                // First check explicit flags
                msg.isBot === true || 
                msg.direction === 'received' || 
                msg.sender === 'bot' || 
                // Then check if the message is NOT from our address (if we have both addresses)
                (ourWalletAddress && msg.senderAddress && 
                 msg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()) ||
                // Check against botInboxId if available
                (botInboxId && msg.senderAddress && 
                 (msg.senderAddress.toLowerCase() === botInboxId.toLowerCase())) ||
                // Check sender inbox ID against botInboxId
                (botInboxId && msg.senderInboxId && msg.senderInboxId === botInboxId) ||
                // Use the enhanced isBotMessage helper with proper params
                isBotMessage(msg, ourWalletAddress || undefined)
              );
              
              // Add detailed logging for stream handler
              console.log('Enhanced stream message direction determination:', {
                id: msg.id,
                senderInboxId: msg.senderInboxId,
                senderAddress: msg.senderAddress,
                botInboxId: botInboxId,
                ourWalletAddress: ourWalletAddress,
                explicitFlags: {
                  isBot: msg.isBot === true,
                  direction: msg.direction === 'received',
                  sender: msg.sender === 'bot'
                },
                addressCheck: (ourWalletAddress && msg.senderAddress && 
                              msg.senderAddress.toLowerCase() !== ourWalletAddress.toLowerCase()),
                botInboxCheck: (botInboxId && msg.senderAddress && 
                              (msg.senderAddress.toLowerCase() === botInboxId.toLowerCase())),
                senderInboxCheck: (botInboxId && msg.senderInboxId && msg.senderInboxId === botInboxId),
                isBotMessageHelperResult: isBotMessage(msg, ourWalletAddress || undefined),
                finalDecision: isFromBot
              });
              
              // Handle content that might be a Promise
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
              
              // Check if this is a duplicate message by comparing with existing messages
              let isDuplicate = false;
              
              // Generate a content hash for deduplication
              let contentHash = '';
              try {
                // If we have attachment format, create hash based on filename, mimeType and contentSize
                if (
                  typeof resolvedContent === 'object' && 
                  resolvedContent?.type?.authorityId === 'xmtp.org' && 
                  resolvedContent?.type?.typeId === 'attachment' &&
                  resolvedContent?.parameters
                ) {
                  const { filename, mimeType, contentSize } = resolvedContent.parameters;
                  contentHash = `${filename}:${mimeType}:${contentSize}:${isFromBot}`;
                } else if (typeof resolvedContent === 'string') {
                  // For text messages, use the content directly
                  contentHash = `${resolvedContent}:${isFromBot}`;
                } else if (resolvedContent && typeof resolvedContent === 'object') {
                  // For other objects, use a JSON representation
                  // Use a more stable approach to stringify objects
                  const stableJsonString = stableStringify(resolvedContent);
                  contentHash = `${stableJsonString}:${isFromBot}`;
                }
                
                // Check for duplicates by comparing with existing messages in the chat
                setChatMessages(prev => {
                  // Check for duplicates using message content hash or direct comparison
                  const msgIsDuplicate = prev.some(existingMsg => {
                    // Extract content hash from ID if it exists
                    const parts = existingMsg.id.split('-');
                    // With our new format, content hash would be after the original message ID
                    // Format is now: timestamp-randomSuffix-msgId-contentHash
                    if (parts.length > 3 && contentHash) {
                      // Get all parts after the message ID as potential content hash
                      const existingContentHash = parts.slice(3).join('-');
                      if (existingContentHash === contentHash) {
                        console.log('Duplicate message detected in stream by content hash, skipping');
                        return true;
                      }
                    }
                    
                    // Also compare raw content as fallback
                    try {
                      const existingContent = existingMsg.content;
                      if (
                        typeof existingContent === 'object' && 
                        typeof resolvedContent === 'object' &&
                        JSON.stringify(existingContent) === JSON.stringify(resolvedContent)
                      ) {
                        console.log('Duplicate message detected by content comparison, skipping');
                        return true;
                      }
                    } catch (compareError) {
                      console.warn('Error comparing message contents:', compareError);
                    }
                    
                    return false;
                  });
                  
                  // Set our outer isDuplicate flag for later use
                  isDuplicate = msgIsDuplicate;
                  
                  // If not a duplicate, add the message
                  if (!msgIsDuplicate) {
                    // Format the message with a unique ID
                    const uniqueTimestamp = Date.now();
                    const randomSuffix = Math.random().toString(36).substring(2, 10);
                    const formattedMessage = {
                      id: `${uniqueTimestamp}-${randomSuffix}-${msg.id}${contentHash ? `-${contentHash}` : ''}`,
                      content: resolvedContent,
                      sender: isFromBot ? 'bot' : 'user',
                      timestamp: msg.sent || new Date(),
                      isBot: isFromBot,
                      direction: isFromBot ? 'received' : 'sent'
                    };
                    
                    console.log('Adding streamed message to chat:', {
                      id: formattedMessage.id,
                      isBot: formattedMessage.isBot
                    });
                    
                    // Return updated messages array
                    return [...prev, formattedMessage];
                  }
                  
                  return prev; // Return unchanged if duplicate
                });
              } catch (hashError) {
                console.warn('Error generating content hash for streamed message:', hashError);
                // If we can't generate a hash, fall back to simple ID-based duplicate check
                const msgId = msg.id || '';
                
                // Only add the message if it's not a duplicate by ID
                setChatMessages(prev => {
                  if (prev.some(existingMsg => {
                    const parts = existingMsg.id.split('-');
                    if (parts.length > 2) {
                      return parts[2] === msgId; // Compare with the third part of our ID format
                    }
                    return false;
                  })) {
                    console.log('Duplicate message detected by ID, skipping');
                    return prev; // Don't add duplicate
                  }
                  
                  // Format the message with a unique fallback ID
                  const uniqueTimestamp = Date.now();
                  const randomSuffix = Math.random().toString(36).substring(2, 10);
                  const formattedMessage = {
                    id: `${uniqueTimestamp}-${randomSuffix}-${msgId || 'stream'}`,
                    content: resolvedContent,
                    sender: isFromBot ? 'bot' : 'user',
                    timestamp: msg.sent || new Date(),
                    isBot: isFromBot,
                    direction: isFromBot ? 'received' : 'sent'
                  };
                  
                  return [...prev, formattedMessage];
                });
              }
            } catch (error) {
              console.error('Error processing streamed message:', error);
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