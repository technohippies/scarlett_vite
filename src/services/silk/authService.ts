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
  private initializationPromise: Promise<void>;
  private initializationComplete: boolean = false;

  constructor() {
    console.log("[AuthService] Initializing");
    
    // Create a promise to track initialization
    this.initializationPromise = this.initialize();
  }
  
  // Initialize the service
  private async initialize(): Promise<void> {
    try {
      // Initialize Silk provider
      this.silkProvider = initSilk({
        config: {
          appName: 'Voice Chat App',
          darkMode: true
        }
      });
      console.log("[AuthService] Silk provider initialized");
      
      // Make it globally available
      if (typeof window !== 'undefined') {
        // @ts-ignore
        window.silk = this.silkProvider;
        console.log("[AuthService] Silk provider attached to window");
        
        // Check if we already have an injected provider (MetaMask, etc.)
        await this.checkExistingConnection();
      }
    } catch (err) {
      console.error("[AuthService] Error initializing Silk:", err);
    } finally {
      this.initializationComplete = true;
    }
  }

  // Wait for initialization to complete
  async waitForInitialization(): Promise<void> {
    return this.initializationPromise;
  }

  // Check if initialization is complete
  isInitialized(): boolean {
    return this.initializationComplete;
  }

  // Check if we already have an existing connection
  private async checkExistingConnection(): Promise<void> {
    console.log("[AuthService] Checking for existing wallet connection");
    
    try {
      // Check for injected provider (MetaMask, etc.)
      if (window.ethereum) {
        console.log("[AuthService] Found injected provider, checking for accounts");
        
        // Create provider
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        
        // Get accounts without prompting user
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        
        if (accounts && accounts.length > 0) {
          console.log(`[AuthService] Found existing account: ${accounts[0]}`);
          
          // Get signer
          this.signer = this.provider.getSigner();
          
          // Get user address
          this.userAddress = await this.signer.getAddress();
          
          // Set authenticated
          this.isAuthenticated = true;
          
          console.log(`[AuthService] Restored connection with address: ${this.userAddress}`);
        } else {
          console.log("[AuthService] No existing accounts found");
        }
      } else {
        console.log("[AuthService] No injected provider found");
      }
    } catch (error) {
      console.error("[AuthService] Error checking existing connection:", error);
    }
  }

  // Get Silk provider
  getSilkProvider(): any {
    return this.silkProvider;
  }

  // Check if user is connected
  isConnected(): boolean {
    const connected = this.isAuthenticated && !!this.userAddress;
    console.log(`[AuthService] isConnected check: ${connected} (isAuthenticated: ${this.isAuthenticated}, userAddress: ${this.userAddress ? 'exists' : 'empty'})`);
    return connected;
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
    console.log("[AuthService] Connecting with Silk...");
    try {
      if (!this.silkProvider) {
        console.error("[AuthService] Silk provider not initialized");
        return { success: false, error: "Silk provider not initialized" };
      }
      
      // Login with Silk
      console.log("[AuthService] Calling silkProvider.login()");
      await this.silkProvider.login();
      console.log("[AuthService] Silk login successful");
      
      // Create provider
      this.provider = new ethers.providers.Web3Provider(this.silkProvider);
      console.log("[AuthService] Created ethers provider from Silk");
      
      // Get signer
      this.signer = this.provider.getSigner();
      console.log("[AuthService] Got signer from provider");
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      console.log(`[AuthService] Got user address: ${this.userAddress}`);
      
      // Set authenticated
      this.isAuthenticated = true;
      console.log("[AuthService] Set isAuthenticated to true");
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("[AuthService] Error connecting with Silk:", error);
      
      let errorMessage = "Failed to connect with Silk";
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      
      return { success: false, error: errorMessage };
    }
  }

  // Connect with injected provider (MetaMask, etc.)
  async connectWithInjected(): Promise<AuthResult> {
    console.log("[AuthService] Connecting with injected provider...");
    try {
      if (!window.ethereum) {
        console.error("[AuthService] No injected provider found");
        return { success: false, error: "No injected provider found" };
      }
      
      // Create provider
      this.provider = new ethers.providers.Web3Provider(window.ethereum);
      console.log("[AuthService] Created ethers provider from window.ethereum");
      
      // Request accounts
      console.log("[AuthService] Requesting accounts from injected provider");
      await window.ethereum.request({ method: 'eth_requestAccounts' });
      console.log("[AuthService] Account request successful");
      
      // Get signer
      this.signer = this.provider.getSigner();
      console.log("[AuthService] Got signer from provider");
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      console.log(`[AuthService] Got user address: ${this.userAddress}`);
      
      // Set authenticated
      this.isAuthenticated = true;
      console.log("[AuthService] Set isAuthenticated to true");
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("[AuthService] Error connecting with injected provider:", error);
      
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
    console.log("[AuthService] Connecting with selector...");
    try {
      if (!this.silkProvider) {
        console.error("[AuthService] Silk provider not initialized");
        return { success: false, error: "Silk provider not initialized" };
      }
      
      // Open login selector
      console.log("[AuthService] Opening login selector");
      const result = await this.silkProvider.loginSelector(window.ethereum);
      console.log(`[AuthService] Login selector result: ${result}`);
      
      if (result === "silk") {
        console.log("[AuthService] User selected Silk");
        // Use Silk as provider
        this.provider = new ethers.providers.Web3Provider(this.silkProvider);
        // @ts-ignore
        window.ethereum = this.silkProvider;
        console.log("[AuthService] Set window.ethereum to silkProvider");
      } else if (result === "injected" && window.ethereum) {
        console.log("[AuthService] User selected injected wallet");
        // Use injected provider
        this.provider = new ethers.providers.Web3Provider(window.ethereum);
        console.log("[AuthService] Created ethers provider from window.ethereum");
        
        // Request accounts
        console.log("[AuthService] Requesting accounts from injected provider");
        await window.ethereum.request({ method: 'eth_requestAccounts' });
        console.log("[AuthService] Account request successful");
      } else if (result === "walletconnect") {
        console.log("[AuthService] User selected WalletConnect");
        // WalletConnect is handled by the caller (using wagmi)
        return { success: true };
      } else {
        console.log("[AuthService] No wallet selected or unknown result");
        return { success: false, error: "No wallet selected" };
      }
      
      // Get signer
      this.signer = this.provider.getSigner();
      console.log("[AuthService] Got signer from provider");
      
      // Get user address
      this.userAddress = await this.signer.getAddress();
      console.log(`[AuthService] Got user address: ${this.userAddress}`);
      
      // Set authenticated
      this.isAuthenticated = true;
      console.log("[AuthService] Set isAuthenticated to true");
      
      return { success: true, address: this.userAddress };
    } catch (error) {
      console.error("[AuthService] Error connecting with selector:", error);
      
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
    console.log("[AuthService] Disconnecting wallet");
    this.provider = null;
    this.signer = null;
    this.userAddress = "";
    this.isAuthenticated = false;
    console.log("[AuthService] Wallet disconnected");
  }

  // Sign message
  async signMessage(message: string): Promise<{ success: boolean; signature?: string; error?: string }> {
    console.log("[AuthService] Signing message");
    try {
      if (!this.isConnected() || !this.signer) {
        console.error("[AuthService] Not connected to wallet");
        return { success: false, error: "Not connected to wallet" };
      }
      
      const signature = await this.signer.signMessage(message);
      console.log("[AuthService] Message signed successfully");
      return { success: true, signature };
    } catch (error) {
      console.error("[AuthService] Error signing message:", error);
      
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