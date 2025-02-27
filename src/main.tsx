import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReownProvider from './context/ReownContext'
import XmtpProvider from './context/XmtpContext'
import initXmtpEnvironment from './utils/xmtpHelper'

// Initialize XMTP environment
initXmtpEnvironment();

// Preload protobufjs is now called inside initXmtpEnvironment
// No need to call it separately

// Ensure Buffer is available
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  import('buffer').then(({ Buffer }) => {
    // @ts-ignore - Adding Buffer to window
    window.Buffer = Buffer;
    console.log('Buffer polyfill loaded');
  }).catch(err => {
    console.error('Failed to load Buffer polyfill:', err);
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReownProvider>
      <XmtpProvider>
        <App />
      </XmtpProvider>
    </ReownProvider>
  </StrictMode>,
)
