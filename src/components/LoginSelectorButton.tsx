import React, { useState } from 'react';
import { Button } from './ui/button';
import { useConnect } from 'wagmi';
import { authService } from '../services/silk/authService';

interface LoginSelectorButtonProps {
  onAuthSuccess: (address: string) => void;
}

const LoginSelectorButton: React.FC<LoginSelectorButtonProps> = ({ onAuthSuccess }) => {
  const { connect, connectors } = useConnect();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLoginSelector = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const silkProvider = authService.getSilkProvider();
      
      if (!silkProvider) {
        setError("Silk provider not initialized");
        setIsLoading(false);
        return;
      }

      // Use the loginSelector method from the Silk provider
      const result = await silkProvider.loginSelector(window.ethereum);

      if (result === "silk") {
        // User selected Silk
        // @ts-ignore
        window.ethereum = silkProvider;
        
        // Connect with Silk
        const authResult = await authService.connectWithSilk();
        
        if (authResult.success && authResult.address) {
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
      console.error('Error using login selector:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        size="lg"
        onClick={handleLoginSelector}
        disabled={isLoading}
        className="font-bold text-lg px-8 py-6 h-auto"
      >
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  );
};

export default LoginSelectorButton; 