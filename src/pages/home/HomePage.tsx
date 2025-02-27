import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllSongs } from '../../hooks/useSongs';
import { MagnifyingGlass, ArrowRight } from '@phosphor-icons/react';
import { ipfsCidToUrl } from '../../lib/tableland/client';

// Mock chat messages for demonstration
const MOCK_CHAT_MESSAGES = [
  { id: '1', content: 'Hello! How can I help you with your language learning today?', sender: 'bot', timestamp: new Date(Date.now() - 3600000) },
  { id: '2', content: 'I want to learn some new vocabulary', sender: 'user', timestamp: new Date(Date.now() - 3500000) },
  { id: '3', content: 'Great! I recommend starting with the song "Mini Skirt". It has a lot of useful everyday phrases.', sender: 'bot', timestamp: new Date(Date.now() - 3400000) },
];

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { songs, loading, error } = useAllSongs();
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT_MESSAGES);
  const [isXmtpConnected, setIsXmtpConnected] = useState(false);
  
  // For demonstration purposes only - in reality we would connect to XMTP
  useEffect(() => {
    // Simulate XMTP connection check
    const checkXmtpConnection = async () => {
      // This would be an actual XMTP connection check in production
      setTimeout(() => {
        setIsXmtpConnected(false);
      }, 1000);
    };
    
    checkXmtpConnection();
  }, []);
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      content: message,
      sender: 'user',
      timestamp: new Date(),
    };
    
    setChatMessages([...chatMessages, userMessage]);
    setMessage('');
    
    // Simulate bot response
    setTimeout(() => {
      const botMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm still learning how to respond properly. Tell me more about what you'd like to learn!",
        sender: 'bot',
        timestamp: new Date(),
      };
      
      setChatMessages(prev => [...prev, botMessage]);
    }, 1000);
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Songs Section */}
      <section className="mb-6">
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
          <div className="grid grid-cols-3 gap-4">
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
      </section>
      
      {/* Chat Section */}
      <section className="flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{t('home.recentChats')}</h2>
          <Link to="/chat" className="text-indigo-400 text-sm flex items-center">
            {t('home.viewAllChats')} <ArrowRight size={16} weight="bold" className="ml-1" />
          </Link>
        </div>
        
        <div className="bg-neutral-800 rounded-lg shadow-sm border border-neutral-700 flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-64">
            {isXmtpConnected ? (
              chatMessages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      msg.sender === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-neutral-700 text-white'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-neutral-400 mb-4 text-center">{t('chat.connectXmtp')}</p>
                <button className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                  {t('common.connect')}
                </button>
              </div>
            )}
          </div>
          
          {isXmtpConnected && (
            <form onSubmit={handleSendMessage} className="p-3 border-t border-neutral-700">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('chat.placeholder')}
                  className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
                />
                <button 
                  type="submit"
                  className="bg-indigo-600 text-white rounded-full p-2"
                  disabled={!message.trim()}
                >
                  <ArrowRight size={20} weight="bold" />
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage; 