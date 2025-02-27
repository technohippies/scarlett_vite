import { cookieStorage, createStorage } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { baseSepolia } from 'viem/chains';
import { defineChain } from 'viem';

// Get projectId from environment variable
// Using import.meta.env for Vite
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '';

if (!projectId) {
  console.warn('Reown Project ID is not defined. Authentication features will not work properly.');
}

// Create a custom Base Sepolia configuration with a public RPC URL
// that won't be blocked by Content Security Policy
export const customBaseSepolia = defineChain({
  ...baseSepolia,
  rpcUrls: {
    ...baseSepolia.rpcUrls,
    default: {
      http: ['https://sepolia.base.org'],
    },
    public: {
      http: ['https://sepolia.base.org'],
    }
  }
});

// Use our custom Base Sepolia configuration
export const networks = [customBaseSepolia];

// Set up the Wagmi Adapter (Config)
export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({
    storage: cookieStorage
  }),
  ssr: false,
  projectId,
  networks
});

export const config = wagmiAdapter.wagmiConfig; 