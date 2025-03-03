import React, { createContext, useContext, ReactNode, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cookieToInitialState, WagmiProvider } from 'wagmi';
import { wagmiAdapter, projectId, customBaseSepolia } from '../config/reown';
import { ethers } from 'ethers';

// Set up queryClient
const queryClient = new QueryClient();

// Create context for AppKit and Ethers
interface AppKitContextType {
  appKit: any;
  ethersProvider: ethers.BrowserProvider | null;
  ethersSigner: ethers.Signer | null;
  isConnected: boolean;
  address: string | null;
  connectWallet: () => Promise<ethers.Signer | null>;
  disconnectWallet: () => void;
  // Add missing properties used in MainLayout.tsx
  events?: {
    on: (event: string, callback: () => void) => void;
    removeAllListeners: () => void;
  };
  getAccount?: () => Promise<{ address: string }>;
  state?: {
    account?: {
      address: string;
    };
  };
  account?: {
    address: string;
  };
  open?: () => void;
  auth?: {
    signIn: () => void;
    signOut: () => void;
  };
  disconnect?: () => void;
}

const AppKitContext = createContext<AppKitContextType>({
  appKit: null,
  ethersProvider: null,
  ethersSigner: null,
  isConnected: false,
  address: null,
  connectWallet: async () => null,
  disconnectWallet: () => {}
});

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

// Define the component as a regular function component, not as a named export
const ReownProvider: React.FC<ReownProviderProps> = ({ 
  children, 
  cookies = null 
}) => {
  const [appKit, setAppKit] = useState<any>(null);
  const [ethersProvider, setEthersProvider] = useState<ethers.BrowserProvider | null>(null);
  const [ethersSigner, setEthersSigner] = useState<ethers.Signer | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [address, setAddress] = useState<string | null>(null);
  
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
        
        setAppKit(appKitInstance);
        console.log('Reown AppKit initialized successfully');
        
        // Initialize ethers provider if window.ethereum is available
        if (window.ethereum) {
          // Use any type to bypass TypeScript checking
          const provider = new ethers.BrowserProvider(window.ethereum as any);
          setEthersProvider(provider);
          console.log('Ethers provider initialized');
          
          // Check if already connected
          try {
            const accounts = await provider.listAccounts();
            if (accounts.length > 0) {
              const signer = await provider.getSigner();
              const userAddress = await signer.getAddress();
              
              setEthersSigner(signer);
              setIsConnected(true);
              setAddress(userAddress);
              console.log('User already connected with address:', userAddress);
            }
          } catch (error) {
            console.error('Error checking existing connection:', error);
          }
        }
      } catch (error) {
        console.error('Failed to initialize Reown AppKit:', error);
      }
    };
    
    initializeAppKit();
  }, []);
  
  // Connect wallet using ethers.js
  const connectWallet = async (): Promise<ethers.Signer | null> => {
    try {
      // Check if ethereum is available
      if (!window.ethereum) {
        console.error('No ethereum provider found');
        return null;
      }
      
      // Use any type to bypass TypeScript checking
      const ethereum = window.ethereum as any;
      
      if (typeof ethereum.request !== 'function') {
        console.error('Ethereum provider does not support request method');
        return null;
      }
      
      // Create provider if not already created
      const provider = new ethers.BrowserProvider(ethereum);
      setEthersProvider(provider);
      
      // Request accounts
      await ethereum.request({ method: 'eth_requestAccounts' });
      
      // Get signer
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      
      setEthersSigner(signer);
      setIsConnected(true);
      setAddress(userAddress);
      
      console.log('Connected with ethers.js, address:', userAddress);
      return signer;
    } catch (error) {
      console.error('Error connecting wallet with ethers:', error);
      return null;
    }
  };
  
  // Disconnect wallet
  const disconnectWallet = () => {
    setEthersSigner(null);
    setIsConnected(false);
    setAddress(null);
    console.log('Disconnected wallet');
  };

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <AppKitContext.Provider value={{
          appKit,
          ethersProvider,
          ethersSigner,
          isConnected,
          address,
          connectWallet,
          disconnectWallet
        }}>
          {children}
        </AppKitContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

// Export as default only, not both named and default
export default ReownProvider; 