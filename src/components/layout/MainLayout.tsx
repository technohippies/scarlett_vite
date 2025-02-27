import React, { useEffect, useState } from 'react';
import { GlobeSimple, SignIn, SignOut, Wallet } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAppKit } from '../../context/ReownContext';

interface MainLayoutProps {
  children: React.ReactNode;
  hideHeader?: boolean;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children, hideHeader = false }) => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const appKit = useAppKit();
  const [isConnected, setIsConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  
  // Check connection status when appKit changes
  useEffect(() => {
    if (!appKit) return;
    
    // Initial check
    checkConnectionStatus();
    
    // Set up event listeners for connection changes
    const setupListeners = async () => {
      try {
        // Check if the appKit has events
        if (appKit.events) {
          appKit.events.on('connect', () => {
            console.log('Connected event fired');
            checkConnectionStatus();
          });
          
          appKit.events.on('disconnect', () => {
            console.log('Disconnected event fired');
            setIsConnected(false);
            setWalletAddress(null);
          });
        }
      } catch (error) {
        console.error('Error setting up event listeners:', error);
      }
    };
    
    setupListeners();
    
    // Check connection status every 2 seconds as a fallback
    const interval = setInterval(checkConnectionStatus, 2000);
    
    return () => {
      clearInterval(interval);
      // Clean up event listeners if possible
      if (appKit && appKit.events) {
        try {
          appKit.events.removeAllListeners();
        } catch (error) {
          console.error('Error removing event listeners:', error);
        }
      }
    };
  }, [appKit]);
  
  const checkConnectionStatus = async () => {
    try {
      if (!appKit) return;
      
      // Try to get account info using different methods
      let address = null;
      
      // Method 1: Check if appKit has getAccount method
      if (typeof appKit.getAccount === 'function') {
        const account = await appKit.getAccount();
        if (account && account.address) {
          address = account.address;
        }
      }
      
      // Method 2: Check if appKit has a state with account info
      if (!address && appKit.state && appKit.state.account) {
        address = appKit.state.account.address;
      }
      
      // Method 3: Check if appKit has an account property
      if (!address && appKit.account && appKit.account.address) {
        address = appKit.account.address;
      }
      
      if (address) {
        setIsConnected(true);
        setWalletAddress(formatAddress(address));
      } else {
        setIsConnected(false);
        setWalletAddress(null);
      }
    } catch (error) {
      console.error('Error checking connection status:', error);
    }
  };
  
  const formatAddress = (address: string): string => {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };
  
  const toggleLanguage = () => {
    const newLanguage = currentLanguage === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(newLanguage);
  };
  
  const handleLogin = () => {
    try {
      console.log('Login button clicked');
      console.log('AppKit available:', !!appKit);
      
      if (appKit) {
        console.log('AppKit methods:', Object.keys(appKit));
        
        // Try to use the open method first (according to docs)
        if (typeof appKit.open === 'function') {
          console.log('Using appKit.open() method');
          appKit.open();
          return;
        }
        
        // Fallback to auth.signIn if available
        if (appKit.auth && typeof appKit.auth.signIn === 'function') {
          console.log('Using appKit.auth.signIn() method');
          appKit.auth.signIn();
          return;
        }
        
        console.warn('AppKit methods not available:', appKit);
        alert('Authentication is not available yet. Please try again later.');
      } else {
        console.warn('AppKit is not available yet');
        alert('Authentication is not available yet. Please try again later.');
      }
    } catch (error) {
      console.error('Error during login:', error);
      alert('Error during login. Please try again later.');
    }
  };
  
  const handleLogout = () => {
    try {
      if (!appKit) return;
      
      // Try different methods to disconnect
      if (typeof appKit.disconnect === 'function') {
        appKit.disconnect();
      } else if (appKit.auth && typeof appKit.auth.signOut === 'function') {
        appKit.auth.signOut();
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col bg-neutral-900 text-white">
      {/* Header - can be hidden */}
      {!hideHeader && (
        <header className="bg-neutral-800 border-b border-neutral-700 sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold">{t('app.name')}</div>
            </div>
            
            <div className="flex items-center gap-4">
              <button 
                onClick={toggleLanguage}
                className="flex items-center gap-1 text-sm text-neutral-300 hover:text-indigo-400"
              >
                <GlobeSimple size={20} weight="bold" />
                {currentLanguage === 'en' ? '中文' : 'English'}
              </button>
              
              {isConnected && walletAddress ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 text-sm bg-neutral-700 px-3 py-1.5 rounded-md">
                    <Wallet size={16} weight="bold" className="text-indigo-400" />
                    <span>{walletAddress}</span>
                  </div>
                  <button 
                    onClick={handleLogout}
                    className="flex items-center gap-1 text-sm bg-neutral-700 hover:bg-neutral-600 text-white px-2 py-1.5 rounded-md"
                  >
                    <SignOut size={16} weight="bold" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="flex items-center gap-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md"
                >
                  <SignIn size={18} weight="bold" />
                  {t('common.login')}
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      
      {/* Main content */}
      <main className="flex-1 flex flex-col relative">
        {children}
      </main>
    </div>
  );
};

export default MainLayout; 