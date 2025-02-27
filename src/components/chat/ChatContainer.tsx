import React from 'react';
import ChatMessages from './ChatMessages';
import ChatInput from './ChatInput';
import { useTranslation } from 'react-i18next';
import XmtpConnectButton from '../XmtpConnectButton';

interface Message {
  id: string;
  content: string;
  sender: string;
  timestamp: Date;
  isBot: boolean;
}

interface ChatContainerProps {
  messages: Message[];
  onSendMessage: (message: string) => void;
  isConnected: boolean;
  isLoading?: boolean;
  connectWallet?: () => Promise<void>;
  statusMessage?: string | null;
  fullHeight?: boolean;
}

const ChatContainer: React.FC<ChatContainerProps> = ({
  messages,
  onSendMessage,
  isConnected,
  isLoading = false,
  connectWallet,
  statusMessage = null,
  fullHeight = false,
}) => {
  const { t } = useTranslation();

  return (
    <div className={`bg-neutral-800 flex flex-col border border-neutral-700 rounded-lg ${fullHeight ? 'h-full' : 'h-[calc(100vh-18rem)]'} md:h-[40vh]`}>
      {/* Messages section */}
      <div className="flex-1 relative overflow-hidden">
        {isConnected ? (
          <>
            <ChatMessages 
              messages={messages} 
              isLoading={isLoading} 
              emptyMessage={t('chat.noMessages')}
            />
            
            {statusMessage && (
              <div className={`absolute bottom-16 left-4 right-4 p-2 rounded ${statusMessage.includes('Error') ? 'bg-red-900/20 text-red-400' : 'bg-blue-900/20 text-blue-400'}`}>
                {statusMessage}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4">
            <p className="text-neutral-400 mb-4 text-center">{t('chat.connectXmtp')}</p>
            {connectWallet ? (
              <button 
                onClick={connectWallet}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                {t('common.connectWallet')}
              </button>
            ) : (
              <XmtpConnectButton />
            )}
          </div>
        )}
      </div>

      {/* Input section */}
      {isConnected && (
        <ChatInput 
          onSendMessage={onSendMessage} 
          placeholder={t('chat.placeholder')}
        />
      )}
    </div>
  );
};

export default ChatContainer; 