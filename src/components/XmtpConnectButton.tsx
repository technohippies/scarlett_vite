import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useXmtp } from '../context/XmtpContext';

interface XmtpConnectButtonProps {
  className?: string;
}

const XmtpConnectButton: React.FC<XmtpConnectButtonProps> = ({ className = '' }) => {
  const { t } = useTranslation();
  const xmtpContext = useXmtp();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!xmtpContext) {
      setError('XMTP context not available');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('Attempting to connect to XMTP...');
      await xmtpContext.connectWithWagmi();
      console.log('Successfully connected to XMTP');
    } catch (err: any) {
      console.error('Failed to connect to XMTP:', err);
      setError(err.message || 'Failed to connect to XMTP');
      
      // If we get a signature validation error, try resetting the connection
      if (err.message && err.message.includes('Signature validation failed')) {
        console.log('Signature validation failed, resetting connection...');
        xmtpContext.resetXmtpConnection();
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // If already connected, show a connected status
  if (xmtpContext?.isConnected) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className="text-green-500 font-medium">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2"></span>
          Connected to XMTP
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <button
        onClick={handleConnect}
        disabled={isConnecting || !xmtpContext}
        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
          isConnecting
            ? 'bg-indigo-400 text-white cursor-not-allowed'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
        }`}
      >
        {isConnecting ? (
          <div className="flex items-center justify-center">
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {t('common.connecting')}
          </div>
        ) : (
          t('chat.connectXmtp')
        )}
      </button>
      
      {error && (
        <div className="mt-2 text-red-500 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default XmtpConnectButton; 