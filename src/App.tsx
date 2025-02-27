import { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './App.css';
import MainLayout from './components/layout/MainLayout';
import './lib/i18n';

// Lazy-loaded components
const HomePage = lazy(() => import('./pages/home/HomePage'));
const SongPage = lazy(() => import('./pages/song/SongPage'));
const PlayPage = lazy(() => import('./pages/play/PlayPage'));
const StudyPage = lazy(() => import('./pages/study/StudyPage'));
const CompletePage = lazy(() => import('./pages/complete/CompletePage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));

// Loader component
const Loader = () => {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-900 text-white">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-400 mb-3"></div>
        <p className="text-neutral-300">{t('common.loading')}</p>
      </div>
    </div>
  );
};

// Hidden Reown AppKit initializer
const ReownInitializer = () => {
  useEffect(() => {
    // Check if the custom element is defined
    const isAppKitButtonDefined = typeof customElements !== 'undefined' && 
      customElements.get('appkit-button');
    
    console.log('AppKit button element is defined:', isAppKitButtonDefined);
    
    // Monitor for when the element becomes available
    if (!isAppKitButtonDefined) {
      const checkInterval = setInterval(() => {
        const isNowDefined = typeof customElements !== 'undefined' && 
          customElements.get('appkit-button');
        
        if (isNowDefined) {
          console.log('AppKit button element is now defined');
          clearInterval(checkInterval);
        }
      }, 1000);
      
      // Clean up interval
      return () => clearInterval(checkInterval);
    }
  }, []);

  // Hidden element for initialization only
  return (
    <div style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none' }}>
      {/* @ts-ignore - Web component */}
      <appkit-button id="hidden-appkit-button" />
    </div>
  );
};

// Updated MainLayout wrapper with flex layout
const MainLayoutWrapper = ({ children }: { children: React.ReactNode }) => {
  return (
    <MainLayout>
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </MainLayout>
  );
};

function App() {
  return (
    <Suspense fallback={<Loader />}>
      <Router>
        <ReownInitializer />
        <Routes>
          <Route path="/" element={<MainLayoutWrapper><HomePage /></MainLayoutWrapper>} />
          <Route path="/songs" element={<MainLayoutWrapper><HomePage /></MainLayoutWrapper>} />
          <Route path="/song/:title" element={<MainLayoutWrapper><SongPage /></MainLayoutWrapper>} />
          <Route path="/song/:title/play" element={<MainLayoutWrapper><PlayPage /></MainLayoutWrapper>} />
          <Route path="/song/:title/study" element={<MainLayoutWrapper><StudyPage /></MainLayoutWrapper>} />
          <Route path="/song/:title/complete" element={<MainLayoutWrapper><CompletePage /></MainLayoutWrapper>} />
          <Route path="/chat" element={<MainLayoutWrapper><ChatPage /></MainLayoutWrapper>} />
        </Routes>
      </Router>
    </Suspense>
  );
}

export default App;
