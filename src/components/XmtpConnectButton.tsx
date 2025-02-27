import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useXmtp } from '../context/XmtpContext';

interface XmtpConnectButtonProps {
  className?: string;
  onConnectSuccess?: () => void;
  onConnectError?: (error: Error) => void;
}

const XmtpConnectButton: React.FC<XmtpConnectButtonProps> = ({ 
  className = '',
  onConnectSuccess,
  onConnectError
}) => {
  const { t } = useTranslation();
  const xmtpContext = useXmtp();
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlternativeMethod, setShowAlternativeMethod] = useState(false);

  // Update local error state when the context error changes
  useEffect(() => {
    if (xmtpContext?.connectionError) {
      setError(xmtpContext.connectionError.message);
      
      // If we get a signature validation error, show alternative connection option
      if (xmtpContext.connectionError.message.includes('Signature validation failed')) {
        setShowAlternativeMethod(true);
      }
      
      // Call the error callback if provided
      if (onConnectError) {
        onConnectError(xmtpContext.connectionError);
      }
    } else if (xmtpContext?.isConnected && error) {
      // Clear error when successfully connected
      setError(null);
    }
  }, [xmtpContext?.connectionError, xmtpContext?.isConnected, error, onConnectError]);

  const handleConnect = async () => {
    if (!xmtpContext) {
      setError('XMTP context not available');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('Attempting to connect to XMTP with Wagmi...');
      await xmtpContext.connectWithWagmi();
      console.log('Successfully connected to XMTP');
      
      // Call success callback if provided
      if (onConnectSuccess) {
        onConnectSuccess();
      }
    } catch (err: any) {
      console.error('Failed to connect to XMTP:', err);
      setError(err.message || 'Failed to connect to XMTP');
      
      // If we get a signature validation error, try resetting the connection
      if (err.message && err.message.includes('Signature validation failed')) {
        console.log('Signature validation failed, showing alternative connection options...');
        setShowAlternativeMethod(true);
      }
    } finally {
      setIsConnecting(false);
    }
  };
  
  const handleConnectWithEthers = async () => {
    if (!xmtpContext) {
      setError('XMTP context not available');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      console.log('Attempting to connect to XMTP with Ethers...');
      await xmtpContext.connectWithEthers();
      console.log('Successfully connected to XMTP with Ethers');
      
      // Call success callback if provided
      if (onConnectSuccess) {
        onConnectSuccess();
      }
    } catch (err: any) {
      console.error('Failed to connect to XMTP with Ethers:', err);
      setError(err.message || 'Failed to connect to XMTP with Ethers');
    } finally {
      setIsConnecting(false);
    }
  };
  
  const handleReset = () => {
    if (!xmtpContext) return;
    
    console.log('Resetting XMTP connection...');
    xmtpContext.resetXmtpConnection();
    setError(null);
    setShowAlternativeMethod(false);
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
      
      {showAlternativeMethod && (
        <div className="mt-2">
          <button
            onClick={handleConnectWithEthers}
            disabled={isConnecting}
            className="px-4 py-2 rounded-lg font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors w-full"
          >
            Try Alternative Connection Method
          </button>
          
          <button
            onClick={handleReset}
            className="mt-2 px-4 py-2 rounded-lg font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors w-full"
          >
            Reset Connection
          </button>
        </div>
      )}
      
      {error && (
        <div className="mt-2 text-red-500 text-sm p-2 bg-red-100 rounded-md border border-red-300">
          <p className="font-medium">Connection Error:</p>
          <p>{error}</p>
          {error.includes('Signature validation failed') && (
            <p className="mt-1 text-xs">
              This could be due to a wallet compatibility issue. Try the alternative connection method or reset your connection.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default XmtpConnectButton; 