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
    
    // Log message for debugging
    if (message) {
      console.log('Message received:', message);
      console.log('Word timestamps:', message.wordTimestamps);
    }
  }, [message]);
  
  // Update highlighted text based on current time
  const updateHighlightedText = (time: number) => {
    if (!message) {
      setHighlightedText(null);
      return;
    }
    
    // Check if we have word timestamps
    if (message.wordTimestamps && message.wordTimestamps.length > 0) {
      const words = message.wordTimestamps;
      
      // Create an array of word spans with appropriate highlighting
      const wordSpans = words.map((word, index) => {
        const isActive = time >= word.start_time && time <= word.end_time;
        
        return (
          <span 
            key={index} 
            className={`inline-block mx-0.5 ${isActive ? 'bg-blue-500 text-white px-1 py-0.5 rounded-md transition-all duration-100' : ''}`}
          >
            {word.text}
          </span>
        );
      });
      
      setHighlightedText(<div className="leading-relaxed">{wordSpans}</div>);
      return;
    }
    
    // Fall back to character-level alignment if available
    if (message.alignment) {
      const { characters, character_start_times_seconds, character_end_times_seconds } = message.alignment;
      
      // Create an array of character spans with appropriate highlighting
      const characterSpans = characters.map((char, index) => {
        const startTime = character_start_times_seconds[index];
        const endTime = character_end_times_seconds[index];
        
        const isHighlighted = time >= startTime && time <= endTime;
        
        return (
          <span 
            key={index} 
            className={isHighlighted ? 'bg-blue-500/10 text-blue-500 font-medium animate-pulse' : ''}
          >
            {char}
          </span>
        );
      });
      
      setHighlightedText(characterSpans);
      return;
    }
    
    // If no timestamps available, just show the content
    setHighlightedText(message.content);
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
    console.log('Audio playing');
    
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
    console.log('Audio paused');
    
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
    console.log('Audio ended');
    
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-40 mt-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <p className="mt-4 text-gray-400">Waiting for response...</p>
      </div>
    );
  }
  
  if (!message) {
    return (
      <div className="flex flex-col items-center justify-center h-40 mt-16">
        <p className="text-gray-400">Send a voice message to start a conversation</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center mt-16 px-4 max-w-2xl mx-auto">
      <div className="w-full bg-gray-800 rounded-lg p-4 shadow-sm">
        <div className="text-lg mb-4 text-white">
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
              className="w-full rounded-lg"
            />
          </div>
        )}
        
        {/* Debug information */}
        <div className="mt-4 p-2 bg-gray-900 rounded text-xs text-gray-400 overflow-auto max-h-40">
          <p>Message ID: {message.id}</p>
          <p>Sender: {message.senderAddress}</p>
          <p>Content Type: {message.contentType}</p>
          <p>Has Audio: {message.audioUrl ? 'Yes' : 'No'}</p>
          <p>Has Word Timestamps: {message.wordTimestamps && message.wordTimestamps.length > 0 ? `Yes (${message.wordTimestamps.length} words)` : 'No'}</p>
          <p>Has Character Alignment: {message.alignment ? 'Yes' : 'No'}</p>
        </div>
      </div>
    </div>
  );
};

export default MessageDisplay; 