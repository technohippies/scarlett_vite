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
  connectionError: Error | null;
  connectXmtp: (signer: any) => Promise<void>;
  connectWithWagmi: () => Promise<boolean>;
  connectWithEthers: () => Promise<boolean>;
  disconnectXmtp: () => void;
  resetXmtpConnection: () => void;
  sendMessage: (conversationId: string, message: string | object) => Promise<any>;
  loadConversations: () => Promise<void>;
  canMessage: (addresses: string[]) => Promise<Map<string, boolean>>;
  getOrCreateConversation: (address: string) => Promise<any>;
} 