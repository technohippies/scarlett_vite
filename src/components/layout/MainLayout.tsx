import React from 'react';
import { GlobeSimple, SignIn } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useAppKit } from '../../context/ReownContext';

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const appKit = useAppKit();
  
  const toggleLanguage = () => {
    const newLanguage = currentLanguage === 'en' ? 'zh' : 'en';
    i18n.changeLanguage(newLanguage);
  };
  
  const handleLogin = () => {
    try {
      if (appKit && appKit.auth && typeof appKit.auth.signIn === 'function') {
        appKit.auth.signIn();
      } else {
        console.warn('AppKit auth is not available yet');
        // Fallback - show a message to the user
        alert('Authentication is not available yet. Please try again later.');
      }
    } catch (error) {
      console.error('Error during login:', error);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col bg-neutral-900 text-white">
      {/* Header */}
      <header className="bg-neutral-800 border-b border-neutral-700 sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{t('app.name')}</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={toggleLanguage}
              className="flex items-center gap-1 text-sm text-neutral-300 hover:text-indigo-400"
            >
              <GlobeSimple size={20} weight="bold" />
              {currentLanguage === 'en' ? '中文' : 'English'}
            </button>
            
            <button 
              onClick={handleLogin}
              className="flex items-center gap-1 text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md"
            >
              <SignIn size={18} weight="bold" />
              {t('common.login')}
            </button>
          </div>
        </div>
      </header>
      
      {/* Main content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
};

export default MainLayout; 