import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { MagnifyingGlass, PaperPlaneRight, Plus } from '@phosphor-icons/react';

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
  const [isXmtpConnected, setIsXmtpConnected] = useState(false);
  const [conversations, setConversations] = useState(MOCK_CONVERSATIONS);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // For demonstration purposes only - in reality we would connect to XMTP
  useEffect(() => {
    // Simulate XMTP connection check
    const checkXmtpConnection = async () => {
      // This would be an actual XMTP connection check in production
      setTimeout(() => {
        setIsXmtpConnected(true); // Set to true for demo purposes
      }, 1000);
    };
    
    checkXmtpConnection();
  }, []);
  
  const activeConversation = conversations.find(conv => conv.id === activeConversationId);
  
  const filteredConversations = searchQuery
    ? conversations.filter(conv => 
        conv.topic.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.messages.some(msg => 
          msg.content.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : conversations;
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || !activeConversationId) return;
    
    // Add user message
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
    
    setMessage('');
    
    // Simulate bot response
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
  
  if (!isXmtpConnected) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="bg-neutral-800 rounded-lg shadow-md border border-neutral-700 p-8 max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">{t('chat.connectXmtp')}</h2>
          <p className="text-neutral-300 mb-6">
            {t('chat.connectXmtpDescription')}
          </p>
          <button className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium">
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
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
              <p className="text-neutral-400 mb-4">
                {t('chat.selectConversation')}
              </p>
              <button
                onClick={startNewConversation}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
              >
                <Plus size={16} weight="bold" />
                {t('chat.startConversation')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ChatPage; 