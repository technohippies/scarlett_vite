import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, createConfig } from "wagmi";
import {
  Chain,
  mainnet,
  sepolia,
  hardhat,
  polygon,
  gnosis,
  optimism,
} from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { WagmiProvider } from "wagmi";
import { authService } from "./services/silk/authService";
import { xmtpService } from "./services/xmtp/xmtpService";
import { XmtpMessage } from "./services/xmtp/xmtpService";
import Header from "./components/Header";
import ConnectButton from "./components/ConnectButton";
import AudioRecorder from "./components/AudioRecorder";
import MessageDisplay from "./components/MessageDisplay";

const defaultChains: Chain[] = [mainnet, polygon, gnosis, sepolia, optimism];

if (process.env.NODE_ENV == "development") {
  defaultChains.push(hardhat);
}

const wagmiConfig = createConfig({
  chains: defaultChains as any as readonly [Chain, ...Chain[]],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
    [polygon.id]: http(),
    [gnosis.id]: http(),
    [optimism.id]: http(),
  },
  connectors: [
    injected(),
    walletConnect({
      projectId: process.env.VITE_WALLETCONNECT_PROJECT_ID || "",
    }),
  ],
});

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [isAuthConnected, setIsAuthConnected] = useState(false);
  const [isXmtpConnected, setIsXmtpConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [currentMessage, setCurrentMessage] = useState<XmtpMessage | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // Check if already connected on mount
  useEffect(() => {
    console.log("[App] Component mounted, checking connection status");
    
    const initializeAuth = async () => {
      try {
        // Wait for auth service to initialize
        console.log("[App] Waiting for auth service to initialize");
        await authService.waitForInitialization();
        console.log("[App] Auth service initialization complete");
        
        // Now check connection status
        if (authService.isConnected()) {
          const address = authService.getUserAddress();
          console.log(`[App] Auth already connected with address: ${address}`);
          setIsAuthConnected(true);
          setUserAddress(address);
        } else {
          console.log("[App] Auth not connected");
        }
        
        if (xmtpService.isConnected()) {
          console.log("[App] XMTP already connected");
          setIsXmtpConnected(true);
        } else {
          console.log("[App] XMTP not connected");
        }
      } catch (error) {
        console.error("[App] Error during initialization:", error);
      } finally {
        setIsInitializing(false);
      }
    };
    
    initializeAuth();
  }, []);
  
  // Handle auth success
  const handleAuthSuccess = (address: string) => {
    console.log(`[App] Auth success callback with address: ${address}`);
    setIsAuthConnected(true);
    setUserAddress(address);
  };
  
  // Handle XMTP success
  const handleXmtpSuccess = () => {
    console.log("[App] XMTP success callback");
    setIsXmtpConnected(true);
    
    // Start listening for messages
    console.log("[App] Starting XMTP message listener");
    xmtpService.startMessageListener((message) => {
      console.log("[App] New message received from listener:", message.id);
      setCurrentMessage(message);
      setIsLoading(false);
    });
    
    // Load conversation history
    console.log("[App] Loading conversation history");
    xmtpService.loadConversationWithBot().then((messages) => {
      console.log(`[App] Loaded ${messages.length} messages from history`);
      if (messages.length > 0) {
        console.log("[App] Setting current message from history");
        setCurrentMessage(messages[messages.length - 1]);
      }
    });
  };
  
  // Handle logout
  const handleLogout = () => {
    console.log("[App] Logout handler called");
    authService.disconnect();
    xmtpService.disconnect();
    setIsAuthConnected(false);
    setIsXmtpConnected(false);
    setUserAddress("");
    setCurrentMessage(null);
    console.log("[App] Logout complete");
  };
  
  // Handle message sent
  const handleMessageSent = () => {
    console.log("[App] Message sent handler called");
    setCurrentMessage(null);
    setIsLoading(true);
  };
  
  // Handle error
  const handleError = (errorMessage: string) => {
    console.error(`[App] Error handler called: ${errorMessage}`);
    setError(errorMessage);
    
    // Clear error after 5 seconds
    setTimeout(() => {
      console.log("[App] Clearing error message");
      setError(null);
    }, 5000);
  };

  console.log(`[App] Rendering with isAuthConnected: ${isAuthConnected}, isXmtpConnected: ${isXmtpConnected}, isInitializing: ${isInitializing}`);

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-neutral-800 text-white flex flex-col overflow-x-hidden">
          <Header 
            isConnected={isAuthConnected} 
            address={userAddress} 
            onLogout={handleLogout} 
          />
          
          <main className="flex-1 flex flex-col items-center justify-center p-4 w-full max-w-full">
            {isInitializing ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                <p className="mt-4 text-gray-400">Initializing...</p>
              </div>
            ) : !isAuthConnected || !isXmtpConnected ? (
              <div className="flex flex-col items-center justify-center h-full w-full">
                <h1 className="text-2xl sm:text-3xl font-bold mb-8 text-white text-center px-4">Voice Chat App</h1>
                <ConnectButton 
                  onAuthSuccess={handleAuthSuccess} 
                  onXmtpSuccess={handleXmtpSuccess} 
                />
              </div>
            ) : (
              <div className="w-full max-w-full flex flex-col items-center">
                <MessageDisplay message={currentMessage} isLoading={isLoading} />
                <AudioRecorder onMessageSent={handleMessageSent} onError={handleError} />
              </div>
            )}
            
            {error && (
              <div className="fixed bottom-24 left-0 right-0 flex justify-center px-4">
                <div className="bg-red-500 text-white px-4 py-2 rounded-md shadow-lg max-w-full text-sm">
                  {error}
                </div>
              </div>
            )}
          </main>
        </div>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default App;
