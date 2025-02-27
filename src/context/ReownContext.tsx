import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cookieToInitialState, WagmiProvider } from 'wagmi';
import { wagmiAdapter, projectId, customBaseSepolia } from '../config/reown';

// Set up queryClient
const queryClient = new QueryClient();

// Create context for AppKit
const AppKitContext = createContext<any>(null);

// Hook to use AppKit
export const useAppKit = () => {
  const context = useContext(AppKitContext);
  if (!context) {
    console.warn('useAppKit must be used within an AppKitProvider');
    return null;
  }
  return context;
};

interface ReownProviderProps {
  children: ReactNode;
  cookies?: string | null;
}

export const ReownProvider: React.FC<ReownProviderProps> = ({ 
  children, 
  cookies = null 
}) => {
  const [appKit, setAppKit] = useState<any>(null);
  const initialState = cookies 
    ? cookieToInitialState(wagmiAdapter.wagmiConfig, cookies)
    : undefined;

  // Initialize appKit dynamically to avoid "process is not defined" error
  useEffect(() => {
    const initializeAppKit = async () => {
      try {
        console.log('Initializing Reown AppKit...');
        
        // Dynamically import to avoid "process is not defined" error
        const { createAppKit } = await import('@reown/appkit/react');
        
        // Set up metadata
        const metadata = {
          name: 'Scarlett',
          description: 'Learn Language Through Music',
          url: window.location.origin,
          icons: ['https://scarlett.learn/icon.png']
        };
        
        // Create the AppKit instance
        const appKitInstance = createAppKit({
          adapters: [wagmiAdapter],
          projectId: projectId || '',
          networks: [customBaseSepolia],
          defaultNetwork: customBaseSepolia,
          metadata: metadata,
          features: {
            analytics: false,
            // Enable all auth methods
            email: true,
            socials: ['google', 'discord', 'github'],
            emailShowWallets: true
          }
        });
        
        console.log('AppKit instance created:', !!appKitInstance);
        console.log('AppKit methods:', Object.keys(appKitInstance));
        
        setAppKit(appKitInstance);
        console.log('Reown AppKit initialized successfully');
      } catch (error) {
        console.error('Failed to initialize Reown AppKit:', error);
      }
    };
    
    initializeAppKit();
  }, []);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitContext.Provider value={appKit}>
          {children}
        </AppKitContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export default ReownProvider; 