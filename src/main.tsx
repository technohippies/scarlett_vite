import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReownProvider from './context/ReownContext'
import { XmtpProvider } from './context/XmtpContext'
import initXmtpEnvironment from './utils/xmtpHelper'

// Ensure Buffer is available first
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  // Load Buffer synchronously to ensure it's available before XMTP initialization
  try {
    const bufferModule = require('buffer');
    // @ts-ignore - Adding Buffer to window
    window.Buffer = bufferModule.Buffer;
    console.log('Buffer polyfill loaded synchronously');
  } catch (err) {
    console.error('Failed to load Buffer polyfill synchronously:', err);
    
    // Fallback to async loading
    import('buffer').then(({ Buffer }) => {
      // @ts-ignore - Adding Buffer to window
      window.Buffer = Buffer;
      console.log('Buffer polyfill loaded asynchronously');
    }).catch(err => {
      console.error('Failed to load Buffer polyfill asynchronously:', err);
    });
  }
}

// Check for SharedArrayBuffer support
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
const hasAtomics = typeof Atomics !== 'undefined';

if (!hasSharedArrayBuffer || !hasAtomics) {
  console.warn('Missing SharedArrayBuffer and/or Atomics. XMTP WASM may not work correctly. The server must emit the COOP/COEP response headers to enable those.');
}

// Initialize XMTP environment
initXmtpEnvironment();

// Preload protobufjs is now called inside initXmtpEnvironment
// No need to call it separately

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReownProvider>
      <XmtpProvider>
        <App />
      </XmtpProvider>
    </ReownProvider>
  </StrictMode>,
)
