import React, { useState, useEffect, useRef } from 'react';
import { XmtpMessage } from '../services/xmtp/xmtpService';

interface MessageDisplayProps {
  message: XmtpMessage | null;
  isLoading: boolean;
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, isLoading }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedText, setHighlightedText] = useState<React.ReactNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<number | null>(null);
  
  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);
  
  // Handle new message
  useEffect(() => {
    // Reset state when message changes
    setCurrentTime(0);
    setIsPlaying(false);
    
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Auto-play audio when a new message arrives
    if (message?.audioUrl) {
      if (audioRef.current) {
        audioRef.current.src = message.audioUrl;
        audioRef.current.play().catch(e => console.error("Failed to play audio:", e));
      }
    }
    
    // Update highlighted text based on initial state
    updateHighlightedText(0);
  }, [message]);
  
  // Update highlighted text based on current time
  const updateHighlightedText = (time: number) => {
    if (!message || !message.alignment) {
      setHighlightedText(message?.content || null);
      return;
    }
    
    const { characters, character_start_times_seconds, character_end_times_seconds } = message.alignment;
    
    // Create an array of character spans with appropriate highlighting
    const characterSpans = characters.map((char, index) => {
      const startTime = character_start_times_seconds[index];
      const endTime = character_end_times_seconds[index];
      
      const isHighlighted = time >= startTime && time <= endTime;
      
      return (
        <span 
          key={index} 
          className={isHighlighted ? 'bg-primary/10 text-primary font-medium animate-pulse' : ''}
        >
          {char}
        </span>
      );
    });
    
    setHighlightedText(characterSpans);
  };
  
  // Handle audio time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const currentTime = audioRef.current.currentTime;
      setCurrentTime(currentTime);
      updateHighlightedText(currentTime);
    }
  };
  
  // Handle audio play
  const handlePlay = () => {
    setIsPlaying(true);
    
    // Set up interval to update time more frequently than the timeupdate event
    if (!intervalRef.current) {
      intervalRef.current = window.setInterval(() => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime);
          updateHighlightedText(audioRef.current.currentTime);
        }
      }, 50); // Update every 50ms for smoother highlighting
    }
  };
  
  // Handle audio pause
  const handlePause = () => {
    setIsPlaying(false);
    
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  // Handle audio ended
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    updateHighlightedText(0);
    
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-40 mt-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="mt-4 text-muted-foreground">Waiting for response...</p>
      </div>
    );
  }
  
  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-40 mt-16">
        <p className="text-muted-foreground">Send a voice message to start a conversation</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center mt-16 px-4 max-w-2xl mx-auto">
      <div className="w-full bg-card rounded-lg p-4 shadow-sm">
        <div className="text-lg mb-4">
          {highlightedText || message.content}
        </div>
        
        {message.audioUrl && (
          <div className="mt-2">
            <audio 
              ref={audioRef}
              src={message.audioUrl} 
              controls
              onTimeUpdate={handleTimeUpdate}
              onPlay={handlePlay}
              onPause={handlePause}
              onEnded={handleEnded}
              className="w-full"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageDisplay; 