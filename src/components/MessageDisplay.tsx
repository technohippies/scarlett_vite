import React, { useState, useEffect, useRef } from 'react';
import { XmtpMessage } from '../services/xmtp/xmtpService';
import { ArrowCounterClockwise } from '@phosphor-icons/react';

interface MessageDisplayProps {
  message: XmtpMessage | null;
  isLoading: boolean;
}

// Define an interface for the parsed JSON content
interface JsonContent {
  text: string;
  audioCorrelationId?: string;
  wordTimestamps?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  // Add fields for audio_response format
  message_type?: string;
  content?: {
    text: string;
    word_timestamps?: Array<{
      word: string;
      start: number;
      end: number;
    }>;
    pair_id?: string;
  };
  pair_id?: string;
}

const MessageDisplay: React.FC<MessageDisplayProps> = ({ message, isLoading }) => {
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [highlightedText, setHighlightedText] = useState<React.ReactNode | null>(null);
  const [parsedJsonContent, setParsedJsonContent] = useState<JsonContent | null>(null);
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
  
  // Parse JSON content if the message is in JSON format
  useEffect(() => {
    if (message && message.contentType === 'text') {
      try {
        // Check if the content is JSON
        const content = message.content as string;
        if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
          const jsonContent = JSON.parse(content) as JsonContent;
          console.log('Parsed JSON message in MessageDisplay:', jsonContent);
          
          setParsedJsonContent(jsonContent);
          
          // Handle the audio_response format
          if (jsonContent.message_type === 'audio_response' && jsonContent.content) {
            // If word timestamps are available in the JSON, map them to the expected format
            if (jsonContent.content.word_timestamps && jsonContent.content.word_timestamps.length > 0) {
              const mappedTimestamps = jsonContent.content.word_timestamps.map(wt => ({
                text: wt.word,
                start_time: wt.start,
                end_time: wt.end
              }));
              
              // Now assign the properly formatted timestamps to the message
              message.wordTimestamps = mappedTimestamps;
            }
          } 
          // Handle the direct format
          else if (jsonContent.text) {
            // If word timestamps are available in the JSON, map them to the expected format
            if (jsonContent.wordTimestamps && jsonContent.wordTimestamps.length > 0) {
              const mappedTimestamps = jsonContent.wordTimestamps.map(wt => ({
                text: wt.word,
                start_time: wt.start,
                end_time: wt.end
              }));
              
              // Now assign the properly formatted timestamps to the message
              message.wordTimestamps = mappedTimestamps;
            }
          }
        } else {
          setParsedJsonContent(null);
        }
      } catch (e) {
        console.error('Failed to parse message content as JSON:', e);
        setParsedJsonContent(null);
      }
    } else {
      setParsedJsonContent(null);
    }
  }, [message]);
  
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
      console.log('Message received in MessageDisplay:', message);
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
      // Using a more stable highlighting approach that doesn't shift layout
      const wordSpans = words.map((word, index) => {
        const isActive = time >= word.start_time && time <= word.end_time;
        
        return (
          <span 
            key={index} 
            className={`relative inline-block mx-0.5 ${isActive ? 'text-blue-500' : ''}`}
          >
            {isActive && (
              <span 
                className="absolute inset-0 bg-blue-100 rounded-sm -z-10" 
                aria-hidden="true"
              />
            )}
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
            className={isHighlighted ? 'text-blue-500' : ''}
          >
            {char}
          </span>
        );
      });
      
      setHighlightedText(characterSpans);
      return;
    }
    
    // If no timestamps available, just show the content
    // If this is a JSON message, use the parsed text content
    setHighlightedText(getDisplayContent());
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
  
  // Function to determine what content to display
  const getDisplayContent = () => {
    if (parsedJsonContent) {
      // Check for audio_response format first
      if (parsedJsonContent.message_type === 'audio_response' && parsedJsonContent.content) {
        return parsedJsonContent.content.text;
      }
      // Then check for direct text format
      if (parsedJsonContent.text) {
        return parsedJsonContent.text;
      }
    }
    return message?.content;
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
    <div className="flex flex-col items-center mt-16 px-2 sm:px-4 w-full max-w-full">
      <div className="w-full max-w-2xl bg-gray-800 rounded-lg p-3 sm:p-4 shadow-sm overflow-hidden">
        <div className="text-base sm:text-lg mb-4 text-white break-words">
          {highlightedText || getDisplayContent()}
        </div>
        
        {message.audioUrl && (
          <div className="mt-2 w-full">
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
            
            <div className="mt-2 flex justify-start">
              <button 
                onClick={() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = 0;
                    audioRef.current.play().catch(e => console.error("Failed to replay audio:", e));
                  }
                }}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-blue-500 transition-colors"
              >
                <ArrowCounterClockwise size={20} weight="bold" />
                <span>Replay</span>
              </button>
            </div>
          </div>
        )}
        
        {/* Debug information */}
        <div className="mt-4 p-2 bg-gray-900 rounded text-xs text-gray-400 overflow-auto max-h-40 text-wrap break-all">
          <p>Message ID: {message.id}</p>
          <p>Sender: {message.senderAddress}</p>
          <p>Content Type: {message.contentType}</p>
          <p>Has Audio: {message.audioUrl ? 'Yes' : 'No'}</p>
          <p>Has Word Timestamps: {message.wordTimestamps && message.wordTimestamps.length > 0 ? `Yes (${message.wordTimestamps.length} words)` : 'No'}</p>
          <p>Has Character Alignment: {message.alignment ? 'Yes' : 'No'}</p>
          <p>Is JSON Message: {parsedJsonContent ? 'Yes' : 'No'}</p>
          <p>Message Format: {parsedJsonContent?.message_type || 'Unknown'}</p>
          <p>Pair ID: {parsedJsonContent?.content?.pair_id || parsedJsonContent?.pair_id || message.pairId || 'None'}</p>
        </div>
      </div>
    </div>
  );
};

export default MessageDisplay; 