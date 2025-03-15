import React, { useState } from 'react';
import { Button } from './ui/button';
import { authService } from '../services/silk/authService';
import { xmtpService } from '../services/xmtp/xmtpService';
import { useConnect } from 'wagmi';

interface ConnectButtonProps {
  onAuthSuccess: (address: string) => void;
  onXmtpSuccess: () => void;
}

const ConnectButton: React.FC<ConnectButtonProps> = ({ onAuthSuccess, onXmtpSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAuthConnected, setIsAuthConnected] = useState(false);
  const { connect, connectors } = useConnect();
  
  const handleConnectWithSelector = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Get the Silk provider
      const silkProvider = authService.getSilkProvider();
      
      if (!silkProvider) {
        setError("Silk provider not initialized");
        setIsLoading(false);
        return;
      }
      
      // Use loginSelector to show wallet options
      const result = await silkProvider.loginSelector(window.ethereum);
      
      if (result === "silk") {
        // User selected Silk
        // @ts-ignore
        window.ethereum = silkProvider;
        
        // Connect with Silk
        const authResult = await authService.connectWithSilk();
        
        if (authResult.success && authResult.address) {
          setIsAuthConnected(true);
          onAuthSuccess(authResult.address);
        } else {
          setError(authResult.error || 'Failed to connect with Silk');
        }
      } else if (result === "injected") {
        // User selected injected wallet (MetaMask, etc.)
        const injectedConnector = connectors.find(conn => conn.id === "injected");
        if (injectedConnector) {
          connect({ connector: injectedConnector });
          
          // Wait for connection and get address
          setTimeout(async () => {
            const authResult = await authService.connectWithInjected();
            if (authResult.success && authResult.address) {
              setIsAuthConnected(true);
              onAuthSuccess(authResult.address);
            } else {
              setError(authResult.error || 'Failed to connect with injected wallet');
            }
          }, 1000);
        } else {
          setError('Injected wallet connector not found');
        }
      } else if (result === "walletconnect") {
        // User selected WalletConnect
        const walletConnectConnector = connectors.find(conn => conn.id === "walletConnect");
        if (walletConnectConnector) {
          connect({ connector: walletConnectConnector });
          
          // Wait for connection and get address
          setTimeout(async () => {
            const authResult = await authService.connectWithInjected();
            if (authResult.success && authResult.address) {
              setIsAuthConnected(true);
              onAuthSuccess(authResult.address);
            } else {
              setError(authResult.error || 'Failed to connect with WalletConnect');
            }
          }, 1000);
        } else {
          setError('WalletConnect connector not found');
        }
      } else {
        setError('No wallet selected');
      }
    } catch (err) {
      console.error('Error connecting:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConnectXmtp = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Connect to XMTP
      const result = await xmtpService.connect();
      
      if (result.success) {
        onXmtpSuccess();
      } else {
        setError(result.error || 'Failed to connect to XMTP');
      }
    } catch (err) {
      console.error('Error connecting to XMTP:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  if (!isAuthConnected) {
    return (
      <div className="flex flex-col items-center gap-4">
        <Button 
          size="lg" 
          onClick={handleConnectWithSelector} 
          disabled={isLoading}
          variant="default"
          className="font-bold text-lg px-8 py-6 h-auto bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all"
        >
          {isLoading ? 'Connecting...' : 'Connect Wallet'}
        </Button>
        {error && <p className="text-red-500 text-sm">{error}</p>}
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center gap-4">
      <Button 
        size="lg" 
        onClick={handleConnectXmtp} 
        disabled={isLoading}
        variant="default"
        className="font-bold text-lg px-8 py-6 h-auto bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all"
      >
        {isLoading ? 'Connecting...' : 'Connect to XMTP'}
      </Button>
      {error && <p className="text-red-500 text-sm">{error}</p>}
    </div>
  );
};

export default ConnectButton; 