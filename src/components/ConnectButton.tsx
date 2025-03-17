import React, { useState, useEffect } from 'react';
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
  
  // Check if already connected on mount
  useEffect(() => {
    console.log("[ConnectButton] Component mounted, checking connection status");
    
    const checkConnection = async () => {
      try {
        // Wait for auth service to initialize
        console.log("[ConnectButton] Waiting for auth service to initialize");
        await authService.waitForInitialization();
        console.log("[ConnectButton] Auth service initialization complete");
        
        // Now check connection status
        const connected = authService.isConnected();
        console.log(`[ConnectButton] Initial auth connected status: ${connected}`);
        
        if (connected) {
          const address = authService.getUserAddress();
          console.log(`[ConnectButton] Already connected with address: ${address}`);
          setIsAuthConnected(true);
          onAuthSuccess(address);
        }
      } catch (error) {
        console.error("[ConnectButton] Error checking connection:", error);
      }
    };
    
    checkConnection();
  }, [onAuthSuccess]);
  
  const handleConnectWithSelector = async () => {
    console.log("[ConnectButton] handleConnectWithSelector called");
    setIsLoading(true);
    setError(null);
    
    try {
      // Get the Silk provider
      const silkProvider = authService.getSilkProvider();
      console.log("[ConnectButton] Got Silk provider:", !!silkProvider);
      
      if (!silkProvider) {
        console.error("[ConnectButton] Silk provider not initialized");
        setError("Silk provider not initialized");
        setIsLoading(false);
        return;
      }
      
      // Use loginSelector to show wallet options
      console.log("[ConnectButton] Opening login selector");
      const result = await silkProvider.loginSelector(window.ethereum);
      console.log(`[ConnectButton] Login selector result: ${result}`);
      
      if (result === "silk") {
        console.log("[ConnectButton] User selected Silk");
        // User selected Silk
        // @ts-ignore
        window.ethereum = silkProvider;
        console.log("[ConnectButton] Set window.ethereum to silkProvider");
        
        // Connect with Silk
        console.log("[ConnectButton] Connecting with Silk");
        const authResult = await authService.connectWithSilk();
        console.log("[ConnectButton] Silk connection result:", authResult);
        
        if (authResult.success && authResult.address) {
          console.log(`[ConnectButton] Successfully connected with Silk: ${authResult.address}`);
          setIsAuthConnected(true);
          onAuthSuccess(authResult.address);
        } else {
          console.error(`[ConnectButton] Failed to connect with Silk: ${authResult.error}`);
          setError(authResult.error || 'Failed to connect with Silk');
        }
      } else if (result === "injected") {
        console.log("[ConnectButton] User selected injected wallet");
        // User selected injected wallet (MetaMask, etc.)
        const injectedConnector = connectors.find(conn => conn.id === "injected");
        console.log("[ConnectButton] Found injected connector:", !!injectedConnector);
        
        if (injectedConnector) {
          console.log("[ConnectButton] Connecting with injected connector");
          connect({ connector: injectedConnector });
          
          // Wait for connection and get address
          console.log("[ConnectButton] Waiting for connection (1s timeout)");
          setTimeout(async () => {
            console.log("[ConnectButton] Timeout complete, connecting with injected provider");
            const authResult = await authService.connectWithInjected();
            console.log("[ConnectButton] Injected connection result:", authResult);
            
            if (authResult.success && authResult.address) {
              console.log(`[ConnectButton] Successfully connected with injected: ${authResult.address}`);
              setIsAuthConnected(true);
              onAuthSuccess(authResult.address);
            } else {
              console.error(`[ConnectButton] Failed to connect with injected: ${authResult.error}`);
              setError(authResult.error || 'Failed to connect with injected wallet');
            }
          }, 1000);
        } else {
          console.error("[ConnectButton] Injected wallet connector not found");
          setError('Injected wallet connector not found');
        }
      } else if (result === "walletconnect") {
        console.log("[ConnectButton] User selected WalletConnect");
        // User selected WalletConnect
        const walletConnectConnector = connectors.find(conn => conn.id === "walletConnect");
        console.log("[ConnectButton] Found WalletConnect connector:", !!walletConnectConnector);
        
        if (walletConnectConnector) {
          console.log("[ConnectButton] Connecting with WalletConnect connector");
          connect({ connector: walletConnectConnector });
          
          // Wait for connection and get address
          console.log("[ConnectButton] Waiting for connection (1s timeout)");
          setTimeout(async () => {
            console.log("[ConnectButton] Timeout complete, connecting with injected provider");
            const authResult = await authService.connectWithInjected();
            console.log("[ConnectButton] WalletConnect connection result:", authResult);
            
            if (authResult.success && authResult.address) {
              console.log(`[ConnectButton] Successfully connected with WalletConnect: ${authResult.address}`);
              setIsAuthConnected(true);
              onAuthSuccess(authResult.address);
            } else {
              console.error(`[ConnectButton] Failed to connect with WalletConnect: ${authResult.error}`);
              setError(authResult.error || 'Failed to connect with WalletConnect');
            }
          }, 1000);
        } else {
          console.error("[ConnectButton] WalletConnect connector not found");
          setError('WalletConnect connector not found');
        }
      } else {
        console.log("[ConnectButton] No wallet selected or unknown result");
        setError('No wallet selected');
      }
    } catch (err) {
      console.error('[ConnectButton] Error connecting:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleConnectXmtp = async () => {
    console.log("[ConnectButton] handleConnectXmtp called");
    setIsLoading(true);
    setError(null);
    
    try {
      // Connect to XMTP
      console.log("[ConnectButton] Connecting to XMTP");
      const result = await xmtpService.connect();
      console.log("[ConnectButton] XMTP connection result:", result);
      
      if (result.success) {
        console.log("[ConnectButton] Successfully connected to XMTP");
        onXmtpSuccess();
      } else {
        console.error(`[ConnectButton] Failed to connect to XMTP: ${result.error}`);
        setError(result.error || 'Failed to connect to XMTP');
      }
    } catch (err) {
      console.error('[ConnectButton] Error connecting to XMTP:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };
  
  console.log(`[ConnectButton] Rendering with isAuthConnected: ${isAuthConnected}`);
  
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