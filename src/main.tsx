import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ReownProvider from './context/ReownContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ReownProvider>
      <App />
    </ReownProvider>
  </StrictMode>,
)
