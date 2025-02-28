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
        throw new Error('XMTP context not available');
      }
      
      // Connect to XMTP using the signer
      await xmtpContext.connectXmtp(reownSigner);
      console.log('Successfully connected to XMTP');
      if (onConnectSuccess) {
        onConnectSuccess();
      }
    } catch (err) {
      console.error('Error connecting to XMTP:', err);
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
        <div className="text-red-500 text-sm mb-2">
          {error}
        </div>
      )}
      
      {!isReownConnected ? (
        <button
          onClick={handleConnectReown}
          disabled={isConnecting}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isConnecting ? t('connecting') : t('connect_to_reown')}
        </button>
      ) : !xmtpContext?.isConnected ? (
        <div className="flex flex-col space-y-2">
          <div className="text-green-600 font-semibold">
            ✓ Wallet Connected: {appKitContext?.address ? `${appKitContext.address.substring(0, 6)}...${appKitContext.address.substring(appKitContext.address.length - 4)}` : 'Unknown'}
          </div>
          <button
            onClick={handleConnectXmtp}
            disabled={isConnecting || !xmtpContext}
            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConnecting ? t('connecting') : t('connect_to_xmtp')}
          </button>
        </div>
      ) : (
        <button
          onClick={() => xmtpContext?.disconnectXmtp()}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors"
        >
          {t('disconnect')}
        </button>
      )}
      
      {(isMobileDevice || showAlternativeMethod) && (
        <button
          onClick={handleConnectWithDirectProvider}
          disabled={isConnecting}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {isConnecting ? t('connecting') : t('connect_with_mobile_wallet')}
        </button>
      )}
      
      {!isMobileDevice && (
        <button
          onClick={() => setShowAlternativeMethod(!showAlternativeMethod)}
          className="text-blue-500 hover:text-blue-700 text-sm underline mt-1"
        >
          {showAlternativeMethod ? t('hide_alternative_methods') : t('show_alternative_methods')}
        </button>
      )}
    </div>
  );
};

export default XmtpConnectButton; 