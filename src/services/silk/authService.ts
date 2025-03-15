import { ethers } from "ethers";
import { initSilk } from "@silk-wallet/silk-wallet-sdk";

// Types
export interface AuthResult {
  success: boolean;
  address?: string;
  error?: string;
}

// Auth Service class
class AuthService {
  private provider: ethers.providers.Web3Provider | null = null;
  private signer: ethers.Signer | null = null;
  private userAddress: string = "";
  private isAuthenticated: boolean = false;
  private silkProvider: any = null;

  constructor() {
    // Initialize Silk provider
    try {
      this.silkProvider = initSilk({
        config: {
          appName: 'Voice Chat App',
          darkMode: true
        }
      });
      
      // Make it globally available
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window.silk = this.silkProvider;
      }
    } catch (err) {
      console.error("Error initializing Silk:", err);
    }
  }

  // Get Silk provider
  getSilkProvider(): any {
    return this.silkProvider;
  }

  // Check if user is connected
  isConnected(): boolean {
    return this.isAuthenticated && !!this.userAddress;
  }

  // Get user address
  getUserAddress(): string {
    return this.userAddress;
  }

  // Get formatted address (shortened)
  getFormattedAddress(): string {
    if (!this.userAddress) return "";
    return `${this.userAddress.substring(0, 6)}...${this.userAddress.substring(this.userAddress.length - 4)}`;
  }

  // Get provider
  getProvider(): ethers.providers.Web3Provider | null {
    return this.provider;
  }

  // Get signer
  getSigner(): ethers.Signer | null {
    return this.signer;
  }

  // Connect with Silk
  async connectWithSilk(): Promise<AuthResult> {
    try {
      if (!this.silkProvider) {
        return { success: false, error: "Silk provider not initialized" };
      }
      
      // Login with Silk
      await this.silkProvider.login();
      
      // Create provider
      this.provider = new ethers.providers.Web3Provider(this.silkProvider);
      
      // Get signer
      this.signer = this.provider.getSigner();
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      
      // Set authenticated
      this.isAuthenticated = true;
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("Error connecting with Silk:", error);
      
      let errorMessage = "Failed to connect with Silk";
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Connect with injected provider (MetaMask, etc.)
  async connectWithInjected(): Promise<AuthResult> {
    try {
      if (!window.ethereum) {
        return { success: false, error: "No injected provider found" };
      }
      
      // Create provider
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      
      // Request accounts
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      
      // Get signer
      this.signer = this.provider.getSigner();
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      
      // Set authenticated
      this.isAuthenticated = true;
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("Error connecting with injected provider:", error);
      
      let errorMessage = "Failed to connect with wallet";
      if (error instanceof Error) {
        if (error.message.includes("user rejected")) {
          errorMessage = "You rejected the connection request";
        } else {
          errorMessage += `: ${error.message}`;
        }
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Connect with login selector
  async connectWithSelector(): Promise<AuthResult> {
    try {
      if (!this.silkProvider) {
        return { success: false, error: "Silk provider not initialized" };
      }
      
      // Open login selector
      const result = await this.silkProvider.loginSelector(window.ethereum);
      
      if (result === "silk") {
        // Use Silk as provider
        this.provider = new ethers.providers.Web3Provider(this.silkProvider);
        // @ts-ignore
        window.ethereum = this.silkProvider;
      } else if (result === "injected" && window.ethereum) {
        // Use injected provider
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Request accounts
        await window.ethereum.request({ method: 'eth_requestAccounts' });
      } else if (result === "walletconnect") {
        // WalletConnect is handled by the caller (using wagmi)
        return { success: true };
      } else {
        return { success: false, error: "No wallet selected" };
      }
      
      // Get signer
      this.signer = this.provider.getSigner();
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      
      // Set authenticated
      this.isAuthenticated = true;
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("Error connecting with selector:", error);
      
      let errorMessage = "Failed to connect wallet";
      if (error instanceof Error) {
        if (error.message.includes("user rejected")) {
          errorMessage = "You rejected the connection request";
        } else {
          errorMessage += `: ${error.message}`;
        }
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Disconnect wallet
  disconnect(): void {
    this.provider = null;
    this.signer = null;
    this.userAddress = "";
    this.isAuthenticated = false;
  }

  // Sign message
  async signMessage(message: string): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      if (!this.isConnected() || !this.signer) {
        return { success: false, error: "Not connected to wallet" };
      }
      
      const signature = await this.signer.signMessage(message);
      return { success: true, signature };
    } catch (error) {
      console.error("Error signing message:", error);
      
      let errorMessage = "Failed to sign message";
      if (error instanceof Error) {
        if (error.message.includes("user rejected")) {
          errorMessage = "You rejected the signature request";
        } else {
          errorMessage += `: ${error.message}`;
        }
      }
      
      return { success: false, error: errorMessage };
    }
  }
}

// Export a singleton instance
export const authService = new AuthService(); 