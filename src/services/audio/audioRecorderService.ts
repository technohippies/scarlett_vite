// Types
export interface RecordingState {
  isRecording: boolean;
  audioBlob?: Blob;
  audioUrl?: string;
  error?: string;
}

// Audio Recorder Service class
class AudioRecorderService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recordingState: RecordingState = {
    isRecording: false
  };
  
  // Get recording state
  getRecordingState(): RecordingState {
    return this.recordingState;
  }
  
  // Start recording
  async startRecording(): Promise<{ success: boolean; error?: string }> {
    try {
      // Reset state
      this.audioChunks = [];
      
      // Request microphone access
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Create media recorder
      this.mediaRecorder = new MediaRecorder(this.stream);
      
      // Set up event handlers
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };
      
      // Start recording
      this.mediaRecorder.start();
      
      // Update state
      this.recordingState = {
        isRecording: true
      };
      
      return { success: true };
    } catch (error) {
      console.error("Error starting recording:", error);
      
      let errorMessage = "Failed to start recording";
      if (error instanceof Error) {
        if (error.name === "NotAllowedError") {
          errorMessage = "Microphone access denied. Please allow microphone access to record audio.";
        } else {
          errorMessage += `: ${error.message}`;
        }
      }
      
      // Update state
      this.recordingState = {
        isRecording: false,
        error: errorMessage
      };
      
      return { success: false, error: errorMessage };
    }
  }
  
  // Stop recording
  async stopRecording(): Promise<{ success: boolean; audioBlob?: Blob; audioUrl?: string; error?: string }> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || !this.stream) {
        const error = "No active recording to stop";
        this.recordingState = {
          isRecording: false,
          error
        };
        resolve({ success: false, error });
        return;
      }
      
      // Set up onstop handler
      this.mediaRecorder.onstop = () => {
        // Create audio blob
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        
        // Create audio URL
        const audioUrl = URL.createObjectURL(audioBlob);
        
        // Stop all tracks in the stream
        this.stream?.getTracks().forEach(track => track.stop());
        
        // Update state
        this.recordingState = {
          isRecording: false,
          audioBlob,
          audioUrl
        };
        
        // Resolve with audio data
        resolve({
          success: true,
          audioBlob,
          audioUrl
        });
      };
      
      // Stop recording
      this.mediaRecorder.stop();
    });
  }
  
  // Check if browser supports audio recording
  isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }
  
  // Clean up resources
  cleanup() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    
    if (this.recordingState.audioUrl) {
      URL.revokeObjectURL(this.recordingState.audioUrl);
    }
    
    this.mediaRecorder = null;
    this.audioChunks = [];
    
    this.recordingState = {
      isRecording: false
    };
  }
}

// Export a singleton instance
export const audioRecorderService = new AudioRecorderService(); 