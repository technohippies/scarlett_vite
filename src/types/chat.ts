export interface ChatMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  isBot: boolean;
  audio_cid?: string;
  // If the message is a structured response to a question
  questionResponse?: {
    uuid: string;
    answer: 'a' | 'b' | 'c' | 'd';
    explanation: string;
    audio_cid: string;
  };
}

export interface Conversation {
  id: string;
  messages: ChatMessage[];
  topic?: string;
  lastMessageTimestamp: Date;
}

export interface XmtpContextType {
  client: any; // XMTP client
  conversations: Conversation[];
  isConnected: boolean;
  isConnecting: boolean;
  connectXmtp: (signer: any) => Promise<void>;
  disconnectXmtp: () => void;
  sendMessage: (conversationId: string, message: string | object) => Promise<void>;
  loadConversations: () => Promise<void>;
} 