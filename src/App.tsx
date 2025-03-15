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

  // Check if already connected on mount
  useEffect(() => {
    if (authService.isConnected()) {
      setIsAuthConnected(true);
      setUserAddress(authService.getUserAddress());
    }
    
    if (xmtpService.isConnected()) {
      setIsXmtpConnected(true);
    }
  }, []);
  
  // Handle auth success
  const handleAuthSuccess = (address: string) => {
    setIsAuthConnected(true);
    setUserAddress(address);
  };
  
  // Handle XMTP success
  const handleXmtpSuccess = () => {
    setIsXmtpConnected(true);
    
    // Start listening for messages
    xmtpService.startMessageListener((message) => {
      setCurrentMessage(message);
      setIsLoading(false);
    });
    
    // Load conversation history
    xmtpService.loadConversationWithBot().then((messages) => {
      if (messages.length > 0) {
        setCurrentMessage(messages[messages.length - 1]);
      }
    });
  };
  
  // Handle logout
  const handleLogout = () => {
    authService.disconnect();
    xmtpService.disconnect();
    setIsAuthConnected(false);
    setIsXmtpConnected(false);
    setUserAddress("");
    setCurrentMessage(null);
  };
  
  // Handle message sent
  const handleMessageSent = () => {
    setCurrentMessage(null);
    setIsLoading(true);
  };
  
  // Handle error
  const handleError = (errorMessage: string) => {
    setError(errorMessage);
    
    // Clear error after 5 seconds
    setTimeout(() => {
      setError(null);
    }, 5000);
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-neutral-800 text-white flex flex-col">
          <Header 
            isConnected={isAuthConnected} 
            address={userAddress} 
            onLogout={handleLogout} 
          />
          
          <main className="flex-1 flex flex-col items-center justify-center p-4">
            {!isAuthConnected || !isXmtpConnected ? (
              <div className="flex flex-col items-center justify-center h-full">
                <h1 className="text-3xl font-bold mb-8 text-white">Voice Chat App</h1>
                <ConnectButton 
                  onAuthSuccess={handleAuthSuccess} 
                  onXmtpSuccess={handleXmtpSuccess} 
                />
              </div>
            ) : (
              <>
                <MessageDisplay message={currentMessage} isLoading={isLoading} />
                <AudioRecorder onMessageSent={handleMessageSent} onError={handleError} />
              </>
            )}
            
            {error && (
              <div className="fixed bottom-24 left-0 right-0 flex justify-center">
                <div className="bg-red-500 text-white px-4 py-2 rounded-md shadow-lg">
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
