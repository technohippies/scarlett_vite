import React from 'react';
import { useXmtp } from '../context/XmtpContext';
import XmtpConnectButton from './XmtpConnectButton';

interface XmtpStatusBannerProps {
  className?: string;
}

const XmtpStatusBanner: React.FC<XmtpStatusBannerProps> = ({ className = '' }) => {
  const xmtp = useXmtp();
  
  // If no XMTP context or already connected, don't show anything
  if (!xmtp || xmtp.isConnected) {
    return null;
  }
  
  // If connecting, show a connecting message
  if (xmtp.isConnecting) {
    return (
      <div className={`bg-indigo-600 text-white p-2 text-center ${className}`}>
        <div className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Connecting to messaging service...
        </div>
      </div>
    );
  }
  
  // If there's a connection error, show the error and a connect button
  if (xmtp.connectionError) {
    return (
      <div className={`bg-red-600 text-white p-2 ${className}`}>
        <div className="container mx-auto flex flex-col md:flex-row items-center justify-between">
          <div className="mb-2 md:mb-0">
            <p className="font-medium">Messaging Connection Error</p>
            <p className="text-sm">{xmtp.connectionError.message}</p>
          </div>
          <div>
            <XmtpConnectButton />
          </div>
        </div>
      </div>
    );
  }
  
  // Otherwise, show a banner prompting to connect
  return (
    <div className={`bg-indigo-800 text-white p-2 ${className}`}>
      <div className="container mx-auto flex flex-col md:flex-row items-center justify-between">
        <p className="mb-2 md:mb-0">Connect to the messaging service to chat with Scarlett</p>
        <XmtpConnectButton />
      </div>
    </div>
  );
};

export default XmtpStatusBanner; 