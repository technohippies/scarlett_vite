import React, { useRef, useEffect } from 'react';

// Format message timestamp for display
export const formatMessageTime = (timestamp: Date) => {
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

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isBot: boolean;
}

interface ChatMessagesProps {
  messages: Message[];
  isLoading?: boolean;
  emptyMessage?: string;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({ 
  messages, 
  isLoading = false,
  emptyMessage = "No messages yet. Start a conversation!" 
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center flex-1">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex justify-center items-center flex-1">
        <p className="text-neutral-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-16">
      {messages.map((msg) => (
        <div 
          key={msg.id} 
          className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}
        >
          <div 
            className={`max-w-[80%] rounded-lg px-3 py-2 ${
              msg.isBot 
                ? 'bg-neutral-700 text-white' 
                : 'bg-indigo-600 text-white'
            }`}
          >
            <p className="text-sm whitespace-pre-wrap break-words">
              {typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2)}
            </p>
            <p className="text-xs opacity-70 mt-1">
              {formatMessageTime(msg.timestamp)}
            </p>
          </div>
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default ChatMessages; 