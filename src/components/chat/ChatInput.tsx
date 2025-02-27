import React, { useState } from 'react';
import { PaperPlaneRight } from '@phosphor-icons/react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  placeholder = "Message Scarlett Bot...",
  disabled = false 
}) => {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || disabled) return;
    
    onSendMessage(message.trim());
    setMessage('');
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 w-full z-10">
      <form 
        onSubmit={handleSubmit} 
        className="p-3 w-full"
      >
        <div className="flex items-center gap-2 w-full">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
          />
          <button 
            type="submit"
            className="bg-indigo-600 text-white rounded-full p-2"
            disabled={!message.trim() || disabled}
          >
            <PaperPlaneRight size={20} weight="bold" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInput; 