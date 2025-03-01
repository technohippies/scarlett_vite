import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReownProvider from './context/ReownContext'
import { XmtpProvider } from './context/XmtpContext'
import initXmtpEnvironment from './utils/xmtpHelper'
import { initIrysEnvironment } from './utils/irysHelper'
import { initApiHandler } from './api/apiHandler'

// Simple Buffer polyfill for XMTP and Irys
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  try {
    const { Buffer } = require('buffer');
    // @ts-ignore
    window.Buffer = Buffer;
    console.log('Buffer polyfill loaded');
  } catch (err) {
    console.error('Failed to load Buffer polyfill:', err);
  }
}

// Check for SharedArrayBuffer support
const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
const hasAtomics = typeof Atomics !== 'undefined';

if (!hasSharedArrayBuffer || !hasAtomics) {
  console.warn('Missing SharedArrayBuffer and/or Atomics. XMTP WASM may not work correctly.');
}

// Initialize environments
initXmtpEnvironment();

// Initialize API handler
initApiHandler();

// Initialize Irys asynchronously
(async () => {
  try {
    await initIrysEnvironment();
    console.log('Irys environment initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Irys environment:', error);
  }
})();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReownProvider>
      <XmtpProvider>
        <App />
      </XmtpProvider>
    </ReownProvider>
  </StrictMode>,
)
