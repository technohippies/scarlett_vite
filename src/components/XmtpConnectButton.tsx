import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useXmtp } from '../context/XmtpContext';
import { ethers } from 'ethers';
import { useAppKit } from '../context/ReownContext';

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
  const appKitContext = useAppKit();
  
  const [isReownConnected, setIsReownConnected] = useState<boolean>(false);
  const [reownSigner, setReownSigner] = useState<ethers.Signer | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showAlternativeMethod, setShowAlternativeMethod] = useState(false);
  const [isMobileDevice, setIsMobileDevice] = useState(false);

  // Detect if we're on a mobile device
  useEffect(() => {
    const checkIfMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
      const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      return isMobile;
    };
    
    const isMobile = checkIfMobile();
    setIsMobileDevice(isMobile);
    
    // If we're on mobile, show alternative methods by default
    if (isMobile) {
      setShowAlternativeMethod(true);
    }
  }, []);

  // Check if user is connected to Reown on component mount
  useEffect(() => {
    const checkReownConnection = async () => {
      try {
        console.log('Checking Reown connection status...');
        if (appKitContext && appKitContext.address && appKitContext.ethersSigner) {
          console.log('User is connected to Reown:', appKitContext.address);
          setIsReownConnected(true);
          setReownSigner(appKitContext.ethersSigner);
        } else {
          console.log('User is not connected to Reown');
          setIsReownConnected(false);
          setReownSigner(null);
        }
      } catch (err) {
        console.error('Error checking Reown connection:', err);
        setIsReownConnected(false);
        setReownSigner(null);
      }
    };

    checkReownConnection();
  }, [appKitContext]);
  
  // Handle connecting to Reown
  const handleConnectReown = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      console.log('Connecting to Reown...');
      
      // Check if we're on mobile
      if (isMobileDevice) {
        console.log('Mobile device detected, using alternative connection method');
        
        // Check if window.ethereum is available
        if (window.ethereum && typeof window.ethereum.request === 'function') {
          try {
            await window.ethereum.request({ method: 'eth_requestAccounts' });
            console.log('Connected to wallet via window.ethereum');
            setIsReownConnected(true);
            
            // Create ethers provider and signer
            const provider = new ethers.BrowserProvider(window.ethereum as any);
            const mobileSigner = await provider.getSigner();
            setReownSigner(mobileSigner);
          } catch (err) {
            console.error('Error connecting via window.ethereum:', err);
            setError('Failed to connect via mobile wallet. Please try again.');
          }
        } else {
          console.log('No window.ethereum available on mobile');
          setError('No wallet detected. Please open in a wallet browser.');
        }
      } else {
        // Desktop flow using Reown's connectWallet
        if (appKitContext && typeof appKitContext.connectWallet === 'function') {
          const signer = await appKitContext.connectWallet();
          console.log('Connected to Reown wallet');
          setIsReownConnected(true);
          
          // Signer should be available from context after connection
          if (signer) {
            setReownSigner(signer);
          }
        } else {
          console.error('connectWallet function not available');
          setError('Connection method not available');
        }
      }
    } catch (err) {
      console.error('Error connecting to Reown:', err);
      setError('Failed to connect to wallet. Please try again.');
    } finally {
      setIsConnecting(false);
    }
  };
  
  // Handle connecting to XMTP
  const handleConnectXmtp = async () => {
    if (!isReownConnected || !reownSigner) {
      console.error('Cannot connect to XMTP: Not connected to Reown');
      setError('Please connect to Reown first');
      return;
    }
    
    setIsConnecting(true);
    setError(null);
    
    try {
      console.log('Connecting to XMTP with signer...');
      
      // Make sure xmtpContext is available
      if (!xmtpContext) {
        console.error('XMTP context not available');
        throw new Error('XMTP context not available');
      }
      
      // Log the current state before connecting
      console.log('XMTP state before connection:', {
        isConnected: xmtpContext.isConnected,
        isConnecting: xmtpContext.isConnecting,
        hasClient: !!xmtpContext.client,
        hasError: !!xmtpContext.connectionError
      });
      
      // Connect to XMTP using the signer
      await xmtpContext.connectXmtp(reownSigner);
      console.log('Successfully connected to XMTP');
      
      // Double-check that we're actually connected
      if (!xmtpContext.isConnected) {
        console.warn('XMTP connection reported success but isConnected is false');
        
        // Log the state after connection attempt
        console.log('XMTP state after connection attempt:', {
          isConnected: xmtpContext.isConnected,
          isConnecting: xmtpContext.isConnecting,
          hasClient: !!xmtpContext.client,
          hasError: !!xmtpContext.connectionError
        });
        
        // Try connecting with wagmi as a fallback
        if (xmtpContext.connectWithWagmi) {
          console.log('Trying connectWithWagmi as fallback...');
          const connected = await xmtpContext.connectWithWagmi();
          console.log('connectWithWagmi result:', connected);
          
          if (!connected) {
            throw new Error('Failed to establish XMTP connection. Please try again.');
          }
        } else {
          throw new Error('Failed to establish XMTP connection. Please try again.');
        }
      }
      
      if (onConnectSuccess) {
        onConnectSuccess();
      }
    } catch (err) {
      console.error('Error connecting to XMTP:', err);
      
      // Log more details about the error
      if (err instanceof Error) {
        console.error('Error details:', {
          name: err.name,
          message: err.message,
          stack: err.stack
        });
      }
      
      setError('Failed to connect to XMTP. Please try again.');
      if (onConnectError) {
        onConnectError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsConnecting(false);
    }
  };
  
  // Handle connecting with direct provider (for mobile)
  const handleConnectWithDirectProvider = async () => {
    if (!xmtpContext) {
      setError('XMTP context not available');
      return;
    }
    
    console.log('Connecting with direct provider...');
    setIsConnecting(true);
    setError(null);
    
    try {
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Please install a wallet.');
      }
      
      // Request accounts with type assertion
      if (typeof window.ethereum.request !== 'function') {
        throw new Error('Ethereum provider does not support requests');
      }
      
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Create ethers provider and signer
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      const signer = await provider.getSigner();
      
      // Connect to XMTP
      await xmtpContext.connectXmtp(signer);
      
      console.log('Successfully connected to XMTP with direct provider');
      if (onConnectSuccess) {
        onConnectSuccess();
      }
    } catch (err) {
      console.error('Error connecting with direct provider:', err);
      setError('Failed to connect. Please try again.');
      if (onConnectError) {
        onConnectError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsConnecting(false);
    }
  };
  
  // Render the button based on connection state
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {error && (
        <div className="text-red-500 text-sm mb-2 bg-red-500/10 p-2 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
      
      {!isReownConnected ? (
        <button
          onClick={handleConnectReown}
          disabled={isConnecting}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isConnecting ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              {t('connecting')}...
            </>
          ) : (
            <>Step 1: Connect Wallet</>
          )}
        </button>
      ) : !xmtpContext?.isConnected ? (
        <div className="flex flex-col space-y-2">
          <div className="text-green-600 font-semibold bg-green-600/10 p-2 rounded flex items-center">
            <span className="mr-2">✓</span> Wallet Connected: {appKitContext?.address ? `${appKitContext.address.substring(0, 6)}...${appKitContext.address.substring(appKitContext.address.length - 4)}` : 'Unknown'}
          </div>
          <button
            onClick={handleConnectXmtp}
            disabled={isConnecting || !xmtpContext}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('connecting')}...
              </>
            ) : (
              <>Step 2: Connect to Messaging</>
            )}
          </button>
          <div className="text-xs text-neutral-400 mt-1">
            This will require a signature to verify your identity.
          </div>
        </div>
      ) : (
        <div className="flex flex-col space-y-2">
          <div className="text-green-600 font-semibold bg-green-600/10 p-2 rounded flex items-center">
            <span className="mr-2">✓</span> Messaging Connected
          </div>
          <button
            onClick={() => xmtpContext?.disconnectXmtp()}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
          >
            {t('disconnect')}
          </button>
        </div>
      )}
      
      {(isMobileDevice || showAlternativeMethod) && !xmtpContext?.isConnected && (
        <div className="mt-4">
          <div className="text-sm text-neutral-400 mb-2">
            Having trouble connecting? Try our direct connection method:
          </div>
          <button
            onClick={handleConnectWithDirectProvider}
            disabled={isConnecting}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full flex items-center justify-center"
          >
            {isConnecting ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('connecting')}...
              </>
            ) : (
              <>Connect with Browser Wallet</>
            )}
          </button>
        </div>
      )}
      
      {!showAlternativeMethod && !isMobileDevice && !xmtpContext?.isConnected && (
        <button
          onClick={() => setShowAlternativeMethod(true)}
          className="text-sm text-blue-500 hover:text-blue-600 underline mt-2"
        >
          Show alternative connection methods
        </button>
      )}
    </div>
  );
};

export default XmtpConnectButton; 