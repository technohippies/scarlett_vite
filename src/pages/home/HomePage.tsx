import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAllSongs } from '../../hooks/useSongs';
import { ArrowRight } from '@phosphor-icons/react';
import { ipfsCidToUrl } from '../../lib/tableland/client';
import { useAppKit } from '../../context/ReownContext';
import { useXmtp } from '../../context/XmtpContext';

// Mock chat messages for demonstration
const MOCK_CHAT_MESSAGES = [
  { id: '1', content: 'Hello! How can I help you with your language learning today?', sender: 'bot', timestamp: new Date(Date.now() - 3600000) },
  { id: '2', content: 'I want to learn some new vocabulary', sender: 'user', timestamp: new Date(Date.now() - 3500000) },
  { id: '3', content: 'Great! I recommend starting with the song "Mini Skirt". It has a lot of useful everyday phrases.', sender: 'bot', timestamp: new Date(Date.now() - 3400000) },
];

const HomePage: React.FC = () => {
  const { t } = useTranslation();
  const { songs, loading, error } = useAllSongs();
  const [message, setMessage] = useState('');
  const [chatMessages, setChatMessages] = useState(MOCK_CHAT_MESSAGES);
  const appKit = useAppKit();
  const xmtp = useXmtp();
  
  // Check XMTP connection status
  useEffect(() => {
    if (xmtp) {
      console.log('XMTP connection status:', xmtp.isConnected);
    }
  }, [xmtp]);
  
  const handleConnectWallet = async () => {
    try {
      console.log('Connect wallet button clicked in HomePage');
      
      if (!appKit) {
        console.warn('AppKit is not available yet in HomePage');
        alert('Authentication is not available yet. Please try again later.');
        return;
      }
      
      // First, ensure the user is connected to Reown
      console.log('AppKit methods available:', Object.keys(appKit));
      
      // Open Reown login
      if (typeof appKit.open === 'function') {
        console.log('Using appKit.open() method in HomePage');
        appKit.open();
        
        // Wait for the login to complete
        console.log('Waiting for login to complete...');
        
        // Instead of using setTimeout, let's wait for the address to be available
        let address = null;
        let attempts = 0;
        const maxAttempts = 10;
        
        while (!address && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          attempts++;
          
          // Try to get address using different methods
          if (typeof appKit.getAddress === 'function') {
            try {
              address = await appKit.getAddress();
              if (address) {
                console.log('Got address after login:', address);
                break;
              }
            } catch (error) {
              console.log('Still waiting for address...');
            }
          }
          
          if (!address && appKit.getCaipAddress && typeof appKit.getCaipAddress === 'function') {
            try {
              const caipAddress = await appKit.getCaipAddress();
              if (caipAddress && typeof caipAddress === 'string') {
                const parts = caipAddress.split(':');
                if (parts.length === 3) {
                  address = parts[2];
                  console.log('Got CAIP address after login:', caipAddress);
                  console.log('Extracted address:', address);
                  break;
                }
              }
            } catch (error) {
              console.log('Still waiting for CAIP address...');
            }
          }
          
          console.log(`Attempt ${attempts}/${maxAttempts} to get address...`);
        }
        
        if (!address) {
          console.warn('Failed to get address after waiting');
          // Continue anyway, as the XMTP context might handle this automatically
        }
      } else if (appKit.auth && typeof appKit.auth.signIn === 'function') {
        console.log('Using appKit.auth.signIn() method in HomePage');
        appKit.auth.signIn();
        
        // Wait for the login to complete
        console.log('Waiting for login to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.warn('AppKit methods not available in HomePage:', appKit);
        alert('Authentication is not available yet. Please try again later.');
        return;
      }
      
      // Check if XMTP is already connected
      if (xmtp && xmtp.isConnected) {
        console.log('Already connected to XMTP');
        return;
      }
      
      // Check if we have a provider after login
      console.log('Checking for provider after login');
      
      // Get the provider from AppKit
      let provider = null;
      if (typeof appKit.getProvider === 'function') {
        try {
          provider = await appKit.getProvider();
          console.log('Provider from appKit.getProvider():', provider);
        } catch (error) {
          console.error('Error getting provider from appKit.getProvider():', error);
        }
      }
      
      // If we don't have a provider from AppKit, try to use the universal provider
      if (!provider && appKit.universalProvider) {
        provider = appKit.universalProvider;
        console.log('Using appKit.universalProvider:', provider);
        
        // Connect to the universal provider before making requests
        try {
          console.log('Connecting to universal provider...');
          await provider.connect();
          console.log('Connected to universal provider');
        } catch (error) {
          console.error('Error connecting to universal provider:', error);
          // Continue anyway, as we might be able to use it without connecting
        }
      }
      
      // If we still don't have a provider, try window.ethereum
      if (!provider && typeof window !== 'undefined' && window.ethereum) {
        provider = window.ethereum;
        console.log('Using window.ethereum as provider:', provider);
      }
      
      if (!provider) {
        console.error('Failed to get provider');
        alert('Failed to get provider. Please try again.');
        return;
      }
      
      // Get the address
      let address = null;
      
      // Try to get address from provider
      try {
        console.log('Requesting accounts from provider...');
        
        // Only make the request if we're not using the universal provider
        // or if we've successfully connected to it
        if (provider !== appKit.universalProvider || provider._state?.wcPairingExpirer) {
          const accounts = await provider.request({ method: 'eth_requestAccounts' });
          if (accounts && accounts.length > 0) {
            address = accounts[0];
            console.log('Address from provider.request:', address);
          }
        }
      } catch (error) {
        console.error('Error requesting accounts from provider:', error);
      }
      
      // If we couldn't get address from provider, try AppKit methods
      if (!address) {
        // Method 1: Try getAddress
        if (appKit.getAddress && typeof appKit.getAddress === 'function') {
          try {
            address = await appKit.getAddress();
            console.log('Address from appKit.getAddress():', address);
          } catch (error) {
            console.error('Error getting address from appKit.getAddress():', error);
          }
        }
        
        // Method 2: Try getCaipAddress
        if (!address && appKit.getCaipAddress && typeof appKit.getCaipAddress === 'function') {
          try {
            const caipAddress = await appKit.getCaipAddress();
            console.log('CAIP address:', caipAddress);
            
            // Extract the address part from the CAIP format (e.g., eip155:1:0x123... -> 0x123...)
            if (caipAddress && typeof caipAddress === 'string') {
              const parts = caipAddress.split(':');
              if (parts.length === 3) {
                address = parts[2];
                console.log('Extracted address from CAIP:', address);
              }
            }
          } catch (error) {
            console.error('Error getting CAIP address:', error);
          }
        }
        
        // Method 3: Try to get from state
        if (!address && appKit.state && appKit.state.account && appKit.state.account.address) {
          address = appKit.state.account.address;
          console.log('Address from appKit.state:', address);
        }
      }
      
      if (!address) {
        console.error('Failed to get address');
        alert('Failed to get your wallet address. Please try again.');
        return;
      }
      
      // Create a signer using the provider
      console.log('Creating signer with address:', address);
      
      // Create a custom signer object that XMTP can use
      // XMTP requires a signer with getAddress and signMessage methods
      const signer = {
        getAddress: async () => address,
        signMessage: async (message: string) => {
          if (!provider) throw new Error('Provider not available');
          
          try {
            // Use the provider to sign the message
            console.log('Signing message with provider...');
            console.log('Message to sign:', message);
            console.log('Address used for signing:', address);
            
            const signature = await provider.request({
              method: 'personal_sign',
              params: [message, address]
            });
            
            console.log('Message signed successfully:', signature);
            return signature;
          } catch (error) {
            console.error('Error signing message:', error);
            throw error;
          }
        },
        // Add these methods for smart contract wallets
        getChainId: () => BigInt(84532), // Base Sepolia testnet
        getBlockNumber: () => BigInt(0) // Return BigInt(0) instead of undefined
      };
      
      console.log('Created custom signer with address:', address);
      
      if (!signer) {
        console.error('Failed to create signer');
        alert('Failed to create signer. Please make sure you have a wallet extension installed.');
        return;
      }
      
      console.log('Signer created, connecting to XMTP');
      
      // Now connect to XMTP with the signer
      if (xmtp) {
        try {
          console.log('Connecting to XMTP with signer');
          await xmtp.connectXmtp(signer);
          console.log('XMTP connection successful');
        } catch (error) {
          console.error('Error connecting to XMTP:', error);
          alert('Failed to connect to XMTP. Please try again.');
        }
      } else {
        console.error('XMTP context not available');
        alert('XMTP service is not available. Please try again later.');
      }
    } catch (error) {
      console.error('Error during connect wallet in HomePage:', error);
      alert('Error during connect wallet. Please try again later.');
    }
  };
  
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim()) return;
    
    // Add user message
    const userMessage = {
      id: Date.now().toString(),
      content: message,
      sender: 'user',
      timestamp: new Date(),
    };
    
    setChatMessages([...chatMessages, userMessage]);
    setMessage('');
    
    // Simulate bot response
    setTimeout(() => {
      const botMessage = {
        id: (Date.now() + 1).toString(),
        content: "I'm still learning how to respond properly. Tell me more about what you'd like to learn!",
        sender: 'bot',
        timestamp: new Date(),
      };
      
      setChatMessages(prev => [...prev, botMessage]);
    }, 1000);
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Songs Section */}
      <section className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{t('home.popularSongs')}</h2>
          <Link to="/songs" className="text-indigo-400 text-sm flex items-center">
            {t('home.viewAllSongs')} <ArrowRight size={16} weight="bold" className="ml-1" />
          </Link>
        </div>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
          </div>
        ) : error ? (
          <div className="bg-red-900/20 text-red-400 p-4 rounded-lg text-center">
            {t('common.error')}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {songs.slice(0, 3).map((song) => (
              <Link 
                key={song.id} 
                to={`/song/${song.song_title}`}
                className="flex flex-col items-center"
              >
                <div className="w-full aspect-square rounded-lg overflow-hidden mb-2">
                  <img 
                    src={ipfsCidToUrl(song.thumb_img_cid)} 
                    alt={song.song_title} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-sm font-medium text-center truncate w-full">{song.song_title}</p>
                <p className="text-xs text-neutral-400 truncate w-full">{song.artist_name}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
      
      {/* Chat Section */}
      <section className="flex-1 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">{t('home.recentChats')}</h2>
          <Link to="/chat" className="text-indigo-400 text-sm flex items-center">
            {t('home.viewAllChats')} <ArrowRight size={16} weight="bold" className="ml-1" />
          </Link>
        </div>
        
        <div className="bg-neutral-800 rounded-lg shadow-sm border border-neutral-700 flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-64">
            {xmtp?.isConnected ? (
              chatMessages.map((msg) => (
                <div 
                  key={msg.id} 
                  className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div 
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      msg.sender === 'user' 
                        ? 'bg-indigo-600 text-white' 
                        : 'bg-neutral-700 text-white'
                    }`}
                  >
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs opacity-70 mt-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full">
                <p className="text-neutral-400 mb-4 text-center">{t('chat.connectXmtp')}</p>
                {appKit && typeof appKit.getAddress === 'function' ? (
                  <div className="flex flex-col gap-3 items-center">
                    <button 
                      onClick={handleConnectWallet}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      {t('common.connect')}
                    </button>
                    <button 
                      onClick={async () => {
                        try {
                          // Check if we already have an address
                          let address;
                          try {
                            address = await appKit.getAddress();
                            console.log('Direct XMTP connect: Got address:', address);
                          } catch (error) {
                            console.error('Direct XMTP connect: Error getting address:', error);
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          if (!address) {
                            console.error('Direct XMTP connect: No address available');
                            alert('Please connect your wallet first');
                            return;
                          }
                          
                          // Get provider
                          let provider;
                          try {
                            provider = await appKit.getProvider();
                            console.log('Direct XMTP connect: Got provider:', provider);
                          } catch (error) {
                            console.error('Direct XMTP connect: Error getting provider:', error);
                          }
                          
                          if (!provider && appKit.universalProvider) {
                            provider = appKit.universalProvider;
                            console.log('Direct XMTP connect: Using universal provider:', provider);
                            
                            // Connect to the universal provider before making requests
                            try {
                              console.log('Connecting to universal provider...');
                              await provider.connect();
                              console.log('Connected to universal provider');
                            } catch (error) {
                              console.error('Error connecting to universal provider:', error);
                              // Continue anyway, as we might be able to use it without connecting
                            }
                          }
                          
                          // Fallback to window.ethereum if no provider is available
                          if (!provider && typeof window !== 'undefined' && window.ethereum) {
                            provider = window.ethereum;
                            console.log('Direct XMTP connect: Falling back to window.ethereum:', provider);
                          }
                          
                          if (!provider) {
                            console.error('Direct XMTP connect: No provider available');
                            alert('Failed to get provider');
                            return;
                          }
                          
                          // Create signer
                          const signer = {
                            walletType: "SCW" as const,
                            getAddress: async () => address,
                            signMessage: async (message: string) => {
                              try {
                                console.log('Direct XMTP connect: Signing message:', message);
                                console.log('Direct XMTP connect: Using address for signing:', address);
                                
                                // Try to sign with the provider
                                const signature = await provider.request({
                                  method: 'personal_sign',
                                  params: [message, address]
                                });
                                
                                console.log('Direct XMTP connect: Signature:', signature);
                                return signature;
                              } catch (error) {
                                console.error('Direct XMTP connect: Error signing message:', error);
                                throw error;
                              }
                            },
                            getChainId: () => BigInt(84532), // Base Sepolia testnet
                            getBlockNumber: () => BigInt(0) // Return BigInt(0) instead of undefined
                          };
                          
                          // Connect to XMTP
                          if (xmtp) {
                            console.log('Direct XMTP connect: Connecting to XMTP...');
                            await xmtp.connectXmtp(signer);
                            console.log('Direct XMTP connect: Connected to XMTP');
                          } else {
                            console.error('Direct XMTP connect: XMTP context not available');
                            alert('XMTP service is not available');
                          }
                        } catch (error) {
                          console.error('Direct XMTP connect: Error:', error);
                          alert('Error connecting to XMTP: ' + ((error as Error).message || 'Unknown error'));
                        }
                      }}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                    >
                      Connect to XMTP directly
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={handleConnectWallet}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    {t('common.connect')}
                  </button>
                )}
              </div>
            )}
          </div>
          
          {xmtp?.isConnected && (
            <form onSubmit={handleSendMessage} className="p-3 border-t border-neutral-700">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('chat.placeholder')}
                  className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
                />
                <button 
                  type="submit"
                  className="bg-indigo-600 text-white rounded-full p-2"
                  disabled={!message.trim()}
                >
                  <ArrowRight size={20} weight="bold" />
                </button>
              </div>
            </form>
          )}
        </div>
      </section>
    </div>
  );
};

export default HomePage; 