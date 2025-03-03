import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import './lib/i18n'
import * as xmtpModuleShim from './utils/xmtpModuleShim'

// Import the Buffer polyfill functions
import { applyBufferPolyfill, isBufferAvailable } from './utils/bufferPolyfill'

// Import worker Buffer test
import './utils/ensureWorkerBuffer'

// Apply Buffer polyfill immediately if not already available
if (typeof window !== 'undefined' && typeof window.Buffer === 'undefined') {
  try {
    const { Buffer } = require('buffer');
    // @ts-ignore
    window.Buffer = Buffer;
    console.log('Buffer polyfill loaded in main.tsx');
  } catch (err) {
    console.error('Failed to load Buffer polyfill in main.tsx:', err);
  }
}

// Apply Buffer polyfill
applyBufferPolyfill();

// Check if Buffer is available
if (isBufferAvailable()) {
  console.log('Buffer is available in main.tsx');
} else {
  console.error('Buffer is not available in main.tsx, some features may not work correctly');
}

import App from './App.tsx'
import ReownProvider from './context/ReownContext'
import { XmtpProvider } from './context/XmtpContext'
import initXmtpEnvironment from './utils/xmtpHelper'
import { initIrysEnvironment } from './utils/irysHelper'
import { initApiHandler } from './api/apiHandler'

// Log that the XMTP module shim is initialized
console.log('XMTP module shim initialization will happen in XmtpContext');

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

// Initialize Irys environment
initIrysEnvironment().then(() => {
  console.log('Irys environment initialized successfully');
}).catch(error => {
  console.error('Failed to initialize Irys environment:', error);
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ReownProvider>
      <XmtpProvider>
        <App />
      </XmtpProvider>
    </ReownProvider>
  </React.StrictMode>,
)
