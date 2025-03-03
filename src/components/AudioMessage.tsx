import React, { useState, useRef } from 'react';
import { Play, Pause, CaretLeft } from '@phosphor-icons/react';

interface AudioMessageProps {
  src: string;
  filename?: string;
  isOwnMessage?: boolean;
}

const AudioMessage: React.FC<AudioMessageProps> = ({ 
  src, 
  filename = 'Audio message',
  isOwnMessage = false
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // Handle play/pause
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(error => {
          console.error('Error playing audio:', error);
        });
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  // Handle time update
  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };
  
  // Handle audio loaded
  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };
  
  // Handle audio ended
  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
    }
  };
  
  // Format time (seconds) to mm:ss
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;
  
  return (
    <div className={`flex flex-col p-2 rounded-lg ${
      isOwnMessage ? 'bg-indigo-600 text-white' : 'bg-neutral-800 text-white'
    }`}>
      <div className="flex items-center space-x-2">
        <button 
          onClick={togglePlay}
          className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isOwnMessage ? 'bg-indigo-700 hover:bg-indigo-800' : 'bg-neutral-700 hover:bg-neutral-600'
          } text-white`}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
        </button>
        
        <div className="flex-1">
          <div className="h-1 bg-gray-600 rounded-full overflow-hidden">
            <div 
              className={`h-full ${isOwnMessage ? 'bg-indigo-400' : 'bg-gray-400'}`} 
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          
          <div className="flex justify-between text-xs mt-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      
      <audio
        ref={audioRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden"
      />
    </div>
  );
};

export default AudioMessage; 