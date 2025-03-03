import React, { useState, useRef } from 'react';
import { PaperPlaneRight, Microphone, Stop } from '@phosphor-icons/react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  onSendAudio?: (audioFile: File) => void;
  placeholder?: string;
  disabled?: boolean;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
  onSendMessage, 
  onSendAudio,
  placeholder = "Message Scarlett Bot...",
  disabled = false 
}) => {
  const [message, setMessage] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!message.trim() || disabled) return;
    
    onSendMessage(message.trim());
    setMessage('');
  };

  const startRecording = async () => {
    if (!onSendAudio) return;
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioFile = new File([audioBlob], 'audio-message.webm', { type: 'audio/webm' });
        
        // Stop all tracks in the stream
        stream.getTracks().forEach(track => track.stop());
        
        // Send the audio file
        onSendAudio(audioFile);
        
        // Reset recording state
        setIsRecording(false);
        setRecordingTime(0);
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      
      // Start recording
      mediaRecorder.start();
      setIsRecording(true);
      
      // Start timer
      timerRef.current = window.setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting audio recording:', error);
      alert('Could not access microphone. Please check your browser permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="sticky bottom-0 left-0 right-0 w-full z-10">
      <form 
        onSubmit={handleSubmit} 
        className="p-3 w-full"
      >
        <div className="flex items-center gap-2 w-full">
          {isRecording ? (
            <div className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm text-white flex items-center">
              <span className="animate-pulse mr-2 text-red-500">●</span>
              <span>Recording... {formatTime(recordingTime)}</span>
            </div>
          ) : (
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={placeholder}
              disabled={disabled || isRecording}
              className="flex-1 bg-neutral-700 rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-white placeholder-neutral-400"
            />
          )}
          
          {onSendAudio && (
            <button 
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`${isRecording ? 'bg-red-600' : 'bg-indigo-600'} text-white rounded-full p-2`}
              disabled={disabled}
            >
              {isRecording ? (
                <Stop size={20} weight="bold" />
              ) : (
                <Microphone size={20} weight="bold" />
              )}
            </button>
          )}
          
          <button 
            type="submit"
            className="bg-indigo-600 text-white rounded-full p-2"
            disabled={!message.trim() || disabled || isRecording}
          >
            <PaperPlaneRight size={20} weight="bold" />
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChatInput; 