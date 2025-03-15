import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Button } from './ui/button';
import { authService } from '../services/silk/authService';
import { xmtpService } from '../services/xmtp/xmtpService';

interface HeaderProps {
  isConnected: boolean;
  address: string;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ isConnected, address, onLogout }) => {
  if (!isConnected) {
    return null; // Don't show header if not connected
  }

  const formattedAddress = authService.getFormattedAddress();
  
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-background border-b border-border flex items-center justify-end px-4 z-10">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">{formattedAddress}</span>
        <Dialog>
          <DialogTrigger asChild>
            <Avatar className="h-8 w-8 cursor-pointer">
              <AvatarFallback>{address.substring(2, 4)}</AvatarFallback>
            </Avatar>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Account</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Address</span>
                <span className="text-xs text-muted-foreground break-all">{address}</span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">XMTP Status</span>
                <span className="text-xs text-muted-foreground">
                  {xmtpService.isConnected() ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium">Plan</span>
                <span className="text-xs text-muted-foreground">Free</span>
              </div>
            </div>
            <div className="flex justify-end">
              <Button variant="destructive" onClick={onLogout}>Logout</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </header>
  );
};

export default Header; 