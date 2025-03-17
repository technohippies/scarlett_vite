import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Microphone } from '@phosphor-icons/react';
import { audioRecorderService } from '../services/audio/audioRecorderService';
import { xmtpService } from '../services/xmtp/xmtpService';

interface AudioRecorderProps {
  onMessageSent: () => void;
  onError: (error: string) => void;
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onMessageSent, onError }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  
  // Check if device is desktop or mobile
  useEffect(() => {
    const checkDevice = () => {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      setIsDesktop(!isMobile);
    };
    
    checkDevice();
    window.addEventListener('resize', checkDevice);
    
    return () => {
      window.removeEventListener('resize', checkDevice);
    };
  }, []);
  
  // Check if audio recording is supported
  useEffect(() => {
    if (!audioRecorderService.isSupported()) {
      onError('Audio recording is not supported in this browser');
    }
    
    // Clean up on unmount
    return () => {
      audioRecorderService.cleanup();
    };
  }, [onError]);
  
  // Start recording
  const startRecording = useCallback(async () => {
    const result = await audioRecorderService.startRecording();
    
    if (!result.success) {
      onError(result.error || 'Failed to start recording');
      return;
    }
    
    setIsRecording(true);
  }, [onError]);
  
  // Stop recording and send message
  const stopRecording = useCallback(async () => {
    setIsRecording(false);
    
    const result = await audioRecorderService.stopRecording();
    
    if (!result.success || !result.audioBlob) {
      onError(result.error || 'Failed to stop recording');
      return;
    }
    
    // Send the audio message
    setIsSending(true);
    
    try {
      const sendResult = await xmtpService.sendMessage(result.audioBlob);
      
      if (!sendResult.success) {
        onError(sendResult.error || 'Failed to send message');
        return;
      }
      
      onMessageSent();
    } catch (err) {
      console.error('Error sending message:', err);
      onError('An unexpected error occurred while sending the message');
    } finally {
      setIsSending(false);
    }
  }, [onError, onMessageSent]);
  
  // Handle key down for desktop (space bar)
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && !isRecording && !isSending && isDesktop) {
      e.preventDefault();
      startRecording();
    }
  }, [isRecording, isSending, isDesktop, startRecording]);
  
  // Handle key up for desktop (space bar)
  const handleKeyUp = useCallback((e: KeyboardEvent) => {
    if (e.code === 'Space' && isRecording && isDesktop) {
      e.preventDefault();
      stopRecording();
    }
  }, [isRecording, isDesktop, stopRecording]);
  
  // Add keyboard event listeners for desktop
  useEffect(() => {
    if (isDesktop) {
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }
  }, [isDesktop, handleKeyDown, handleKeyUp]);
  
  // Handle mouse/touch events for mobile
  const handleTouchStart = () => {
    if (!isRecording && !isSending && !isDesktop) {
      startRecording();
    }
  };
  
  const handleTouchEnd = () => {
    if (isRecording && !isDesktop) {
      stopRecording();
    }
  };
  
  return (
    <div className="fixed bottom-6 left-0 right-0 flex justify-center">
      <Button
        size="round-lg"
        className={`shadow-lg ${isRecording ? 'bg-destructive hover:bg-destructive' : 'bg-blue-500 hover:bg-blue-600'}`}
        onMouseDown={isDesktop ? startRecording : undefined}
        onMouseUp={isDesktop ? stopRecording : undefined}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        disabled={isSending}
      >
        <Microphone size={32} weight={isRecording ? "fill" : "regular"} />
      </Button>
      {isSending && (
        <div className="absolute -top-10 left-0 right-0 text-center">
          <span className="text-sm bg-background/80 px-3 py-1 rounded-full">Sending...</span>
        </div>
      )}
      <div className="absolute -top-10 left-0 right-0 text-center">
        <span className="text-xs text-muted-foreground">
          {isDesktop ? 'Hold space to record' : 'Tap and hold to record'}
        </span>
      </div>
    </div>
  );
};

export default AudioRecorder; 