import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass, PaperPlaneRight, Plus } from '@phosphor-icons/react';
import { useXmtp } from '../../context/XmtpContext';
import { useAppKit } from '../../context/ReownContext';

// Mock conversation data for demonstration
const MOCK_CONVERSATIONS = [
  { 
    id: '1', 
    topic: 'Learning Chinese Vocabulary',
    lastMessageTimestamp: new Date(Date.now() - 3600000),
    messages: [
      { id: '1-1', content: 'Hello! How can I help you with your language learning today?', sender: 'bot', timestamp: new Date(Date.now() - 3600000), isBot: true },
      { id: '1-2', content: 'I want to learn some new vocabulary', sender: 'user', timestamp: new Date(Date.now() - 3500000), isBot: false },
      { id: '1-3', content: 'Great! I recommend starting with the song "Mini Skirt". It has a lot of useful everyday phrases.', sender: 'bot', timestamp: new Date(Date.now() - 3400000), isBot: true },
    ]
  },
  { 
    id: '2', 
    topic: 'Grammar Questions',
    lastMessageTimestamp: new Date(Date.now() - 86400000),
    messages: [
      { id: '2-1', content: 'Hello! How can I help you with your language learning today?', sender: 'bot', timestamp: new Date(Date.now() - 86400000), isBot: true },
      { id: '2-2', content: 'I\'m confused about past tense in Chinese', sender: 'user', timestamp: new Date(Date.now() - 85000000), isBot: false },
      { id: '2-3', content: 'Chinese doesn\'t have tenses like English. Instead, it uses time markers and aspect particles. Let me explain...', sender: 'bot', timestamp: new Date(Date.now() - 84000000), isBot: true },
    ]
  },
];

const ChatPage: React.FC = () => {
  const { t } = useTranslation();
  const xmtp = useXmtp();
  const appKit = useAppKit();
  const [conversations, setConversations] = useState(MOCK_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Use XMTP conversations if available
  useEffect(() => {
    if (xmtp?.isConnected && xmtp.conversations.length > 0) {
      console.log('Using XMTP conversations:', xmtp.conversations);
      
      // Convert XMTP conversations to the format expected by this component
      const formattedConversations = xmtp.conversations.map(conv => ({
        id: conv.id,
        topic: conv.topic || 'New Conversation', // Provide default if topic is undefined
        lastMessageTimestamp: conv.lastMessageTimestamp,
        messages: conv.messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: msg.timestamp,
          isBot: msg.isBot
        }))
      }));
      
      setConversations(formattedConversations);
      
      // Set the active conversation to the most recent one
      if (formattedConversations.length > 0 && !activeConversationId) {
        setActiveConversationId(formattedConversations[0].id);
      }
    }
  }, [xmtp?.isConnected, xmtp?.conversations, activeConversationId]);
  
  const activeConversation = conversations.find(conv => conv.id === activeConversationId);
  
  const filteredConversations = searchQuery
    ? conversations.filter(conv => 
        conv.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages.some(msg => 
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : conversations;
  
  const handleConnectWallet = async () => {
    try {
      console.log('Connect wallet button clicked in ChatPage');
      
      if (!appKit) {
        console.warn('AppKit is not available yet in ChatPage');
        alert('Authentication is not available yet. Please try again later.');
        return;
      }
      
      // First, ensure the user is connected to Reown
      let signer = null;
      
      // Try to get the signer from AppKit
      if (appKit.getSigner && typeof appKit.getSigner === 'function') {
        console.log('Getting signer from appKit.getSigner()');
        signer = await appKit.getSigner();
      } else if (appKit.getProvider && typeof appKit.getProvider === 'function') {
        console.log('Getting provider from appKit.getProvider()');
        const provider = await appKit.getProvider();
        if (provider && provider.getSigner) {
          signer = provider.getSigner();
        }
      }
      
      if (!signer) {
        console.log('No signer available, opening Reown login');
        // Open Reown login if no signer is available
        if (typeof appKit.open === 'function') {
          console.log('Using appKit.open() method in ChatPage');
          await appKit.open();
        } else if (appKit.auth && typeof appKit.auth.signIn === 'function') {
          console.log('Using appKit.auth.signIn() method in ChatPage');
          await appKit.auth.signIn();
        } else {
          console.warn('AppKit methods not available in ChatPage:', appKit);
          alert('Authentication is not available yet. Please try again later.');
          return;
        }
        
        // Wait a moment for the login to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to get the signer again
        if (appKit.getSigner && typeof appKit.getSigner === 'function') {
          signer = await appKit.getSigner();
        } else if (appKit.getProvider && typeof appKit.getProvider === 'function') {
          const provider = await appKit.getProvider();
          if (provider && provider.getSigner) {
            signer = provider.getSigner();
          }
        }
      }
      
      if (!signer) {
        console.error('Failed to get signer after login');
        alert('Failed to get signer. Please try again.');
        return;
      }
      
      console.log('Signer obtained, connecting to XMTP');
      
      // Now connect to XMTP with the signer
      if (xmtp) {
        try {
          console.log('Connecting to XMTP with signer');
          await xmtp.connectXmtp(signer);
          console.log('XMTP connection successful');
        } catch (error) {
          console.error('Error connecting to XMTP:', error);
          alert('Failed to connect to XMTP. Please try again.');
        }
      } else {
        console.error('XMTP context not available');
        alert('XMTP service is not available. Please try again later.');
      }
    } catch (error) {
      console.error('Error during connect wallet in ChatPage:', error);
      alert('Error during connect wallet. Please try again later.');
    }
  };
  
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !activeConversationId) return;
    
    // Add user message to UI immediately for better UX
    const userMessage = {
      id: Date.now().toString(),
      content: message,
      sender: 'user',
      timestamp: new Date(),
      isBot: false
    };
    
    setConversations(prevConversations => 
      prevConversations.map(conv => 
        conv.id === activeConversationId
          ? {
              ...conv,
              messages: [...conv.messages, userMessage],
              lastMessageTimestamp: new Date()
            }
          : conv
      )
    );
    
    const messageContent = message;
    setMessage('');
    
    // Send message via XMTP if connected
    if (xmtp?.isConnected) {
      try {
        console.log('Sending message via XMTP:', messageContent);
        await xmtp.sendMessage(activeConversationId, messageContent);
        console.log('Message sent successfully via XMTP');
        
        // XMTP will handle the conversation update through the context
      } catch (error) {
        console.error('Error sending message via XMTP:', error);
        
        // Fallback to mock response if XMTP fails
        setTimeout(() => {
          const botMessage = {
            id: (Date.now() + 1).toString(),
            content: "I'm still learning how to respond properly. Tell me more about what you'd like to learn!",
            sender: 'bot',
            timestamp: new Date(),
            isBot: true
          };
          
          setConversations(prevConversations => 
            prevConversations.map(conv => 
              conv.id === activeConversationId
                ? {
                    ...conv,
                    messages: [...conv.messages, botMessage],
                    lastMessageTimestamp: new Date()
                  }
                : conv
            )
          );
        }, 1000);
      }
    } else {
      // Mock response for demonstration
      setTimeout(() => {
        const botMessage = {
          id: (Date.now() + 1).toString(),
          content: "I'm still learning how to respond properly. Tell me more about what you'd like to learn!",
          sender: 'bot',
          timestamp: new Date(),
          isBot: true
        };
        
        setConversations(prevConversations => 
          prevConversations.map(conv => 
            conv.id === activeConversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, botMessage],
                  lastMessageTimestamp: new Date()
                }
              : conv
          )
        );
      }, 1000);
    }
  };
  
  const startNewConversation = () => {
    const newConversation = {
      id: Date.now().toString(),
      topic: 'New Conversation',
      lastMessageTimestamp: new Date(),
      messages: [
        {
          id: Date.now().toString(),
          content: 'Hello! How can I help you with your language learning today?',
          sender: 'bot',
          timestamp: new Date(),
          isBot: true
        }
      ]
    };
    
    setConversations([newConversation, ...conversations]);
    setActiveConversationId(newConversation.id);
  };
  
  if (!xmtp?.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="bg-neutral-800 rounded-lg shadow-md border border-neutral-700 p-8 max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">{t('chat.connectXmtp')}</h2>
          <p className="text-neutral-300 mb-6">
            {t('chat.connectXmtpDescription')}
          </p>
          <button 
            onClick={handleConnectWallet}
            className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium"
          >
            {t('common.connect')}
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="flex h-full">
        {/* Conversations sidebar */}
        <div className="w-1/3 border-r border-neutral-700 flex flex-col bg-neutral-800">
          <div className="p-3 border-b border-neutral-700">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('chat.searchConversations')}
                className="w-full bg-neutral-700 rounded-full px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
              />
              <MagnifyingGlass size={16} className="absolute left-3 top-2.5 text-neutral-400" />
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {filteredConversations.length > 0 ? (
              filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  className={`w-full text-left p-3 border-b border-neutral-700 hover:bg-neutral-700 ${
                    activeConversationId === conv.id ? 'bg-neutral-700' : ''
                  }`}
                  onClick={() => setActiveConversationId(conv.id)}
                >
                  <h3 className="font-medium truncate">{conv.topic}</h3>
                  <p className="text-sm text-neutral-400 truncate">
                    {conv.messages[conv.messages.length - 1]?.content}
                  </p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {conv.lastMessageTimestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </button>
              ))
            ) : (
              <div className="p-4 text-center text-neutral-400">
                {t('chat.noConversationsFound')}
              </div>
            )}
          </div>
          
          <div className="p-3 border-t border-neutral-700">
            <button
              onClick={startNewConversation}
              className="w-full bg-indigo-600 text-white rounded-lg py-2 flex items-center justify-center gap-2"
            >
              <Plus size={16} weight="bold" />
              {t('chat.newConversation')}
            </button>
          </div>
        </div>
        
        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-neutral-900">
          {activeConversation ? (
            <>
              {/* Chat header */}
              <div className="p-3 border-b border-neutral-700">
                <h2 className="font-medium">{activeConversation.topic}</h2>
              </div>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeConversation.messages.map(msg => (
                  <div 
                    key={msg.id} 
                    className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}
                  >
                    <div 
                      className={`max-w-[80%] rounded-lg px-3 py-2 ${
                        msg.isBot 
                          ? 'bg-neutral-800 text-white' 
                          : 'bg-indigo-600 text-white'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Message input */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-neutral-700">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder={t('chat.placeholder')}
                    className="flex-1 bg-neutral-800 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
                  />
                  <button 
                    type="submit"
                    className="bg-indigo-600 text-white rounded-full p-2"
                    disabled={!message.trim()}
                  >
                    <PaperPlaneRight size={20} weight="bold" />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-neutral-400 mb-4">{t('chat.selectConversation')}</p>
                <button
                  onClick={startNewConversation}
                  className="bg-indigo-600 text-white rounded-lg py-2 px-4 flex items-center justify-center gap-2 mx-auto"
                >
                  <Plus size={16} weight="bold" />
                  {t('chat.newConversation')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 