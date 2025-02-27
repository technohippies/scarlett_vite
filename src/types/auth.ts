export interface User {
  address: string;
  displayName?: string;
  profileImage?: string;
  isAuthenticated: boolean;
  hasPremiumAccess?: boolean;
}

export interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  checkPremiumAccess: () => Promise<boolean>;
}

export interface WalletContextType {
  isConnected: boolean;
  address: string | null;
  chainId: number | null;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
} 