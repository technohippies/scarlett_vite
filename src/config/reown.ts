import { cookieStorage, createStorage } from '@wagmi/core';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';

// Get projectId from environment variable
// Using import.meta.env for Vite
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '';

if (!projectId) {
  console.warn('Reown Project ID is not defined. Authentication features will not work properly.');
}

// Define Base Sepolia network configuration for Ethers and Wagmi
export const customBaseSepolia = {
  id: 84532,
  name: 'Base Sepolia',
  network: 'base-sepolia',
  nativeCurrency: {
    name: 'Sepolia Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://sepolia.base.org'],
    },
    public: {
      http: ['https://sepolia.base.org'],
    }
  }
};

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