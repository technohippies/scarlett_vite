import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { useQuestions } from '../../hooks/useQuestions';
import { Play, Pause, ArrowRight, CaretLeft } from '@phosphor-icons/react';
import PageHeader from '../../components/layout/PageHeader';
import { useXmtp } from '../../context/XmtpContext';
import Spinner from '../../components/ui/Spinner';
import { SCARLETT_BOT_ADDRESS } from '../../lib/constants';
import { fsrsService } from '../../lib/fsrs/client';
import FsrsDebugPanel from '../../components/debug/FsrsDebugPanel';
import { logFsrsProgress, logIrysData } from '../../utils/fsrsDebugger';
import { useAppKit } from '../../context/ReownContext';

// Interface for the question answer JSON sent to XMTP
interface QuestionAnswerRequest {
  uuid: string;
  selectedAnswer: string;
  songId: string;
}

// Interface for the response from XMTP bot
interface QuestionAnswerResponse {
  uuid: string;
  answer: string;
  explanation: string;
  audio_cid?: string;
  isCorrect?: boolean;
}

// Interface for XMTP message
interface XmtpMessage {
  id: string;
  content: string | any;
  senderAddress?: string;
  recipientAddress?: string;
  sent: Date | string;
  [key: string]: any;
}

// Custom replacer function to handle BigInt values during JSON serialization
const bigIntReplacer = (_key: string, value: any) => {
  // Convert BigInt to String during serialization
  if (typeof value === 'bigint') {
    return value.toString() + 'n';
  }
  return value;
};

const StudyPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language as 'en' | 'zh';
  const { song, loading: songLoading, error: songError } = useSongByTitle(title || null);
  const xmtp = useXmtp();
  const navigate = useNavigate();
  const appKit = useAppKit();
  const address = appKit?.address;
  
  // Add state to track the selected study language (which may be different from UI language)
  const [studyLanguage, setStudyLanguage] = useState<'en' | 'zh'>(currentLanguage);
  
  // Update study language when browser language changes
  useEffect(() => {
    setStudyLanguage(currentLanguage);
  }, [currentLanguage]);
  
  // Get the appropriate questions CID based on selected study language
  const questionsCid = song ? (studyLanguage === 'en' ? song.questions_cid_2 : song.questions_cid_1) : undefined;
  
  const { 
    currentQuestion, 
    loading: questionsLoading, 
    error: questionsError,
    goToNextQuestion,
    setQuestionAnswer,
    currentIndex,
    totalQuestions,
    resetQuestions
  } = useQuestions(questionsCid);
  
  // Reset questions when study language changes - FIXED: removed resetQuestions from dependency array
  useEffect(() => {
    if (resetQuestions) {
      resetQuestions();
    }
  }, [studyLanguage]); // Removed resetQuestions from dependency array to prevent infinite loop
  
  const [selectedAnswer, setSelectedAnswer] = useState<'a' | 'b' | 'c' | 'd' | null>(null);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    explanation: string;
    audioCid?: string;
  } | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isAudioFinished, setIsAudioFinished] = useState(false);
  const [audioHasPlayed, setAudioHasPlayed] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [isXmtpReady, setIsXmtpReady] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Add state for the debug panel
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Add state for tracking answered questions
  const [questionAnswers, setQuestionAnswers] = useState<Array<{
    uuid: string;
    selectedAnswer: string;
    isCorrect: boolean;
    timestamp: number;
    fsrs?: any;
  }>>([]);
  
  // Add state for FSRS cards
  const [fsrsCards, setFsrsCards] = useState<Map<string, any>>(new Map());
  
  // Add state for tracking XMTP connection status
  const [isXmtpConnecting, setIsXmtpConnecting] = useState(false);
  const [xmtpConnectionError, setXmtpConnectionError] = useState<string | null>(null);
  
  // Check initial XMTP connection status when component mounts
  useEffect(() => {
    if (xmtp) {
      console.log('Initial XMTP connection check:', { 
        isConnected: xmtp.isConnected, 
        hasClient: !!xmtp.client 
      });
      
      // If we already have a client or are connected, set ready state
      if (xmtp.client || xmtp.isConnected) {
        console.log('User is already connected to XMTP');
        setIsXmtpReady(true);
      }
    }
  }, []);
  
  // Check if XMTP is connected - FIXED: added connection attempt tracking
  useEffect(() => {
    // Check if XMTP is connected when the component mounts or when xmtp context changes
    if (xmtp) {
      console.log('Checking XMTP connection status:', { 
        isConnected: xmtp.isConnected, 
        hasClient: !!xmtp.client 
      });
      
      // Consider connected if either isConnected is true or client exists
      if (xmtp.isConnected || xmtp.client) {
        console.log('XMTP is connected or has client');
        setIsXmtpReady(true);
        setIsXmtpConnecting(false);
        setXmtpConnectionError(null);
      } else {
        console.log('XMTP is not connected');
        setIsXmtpReady(false);
      }
    }
  }, [xmtp, xmtp?.isConnected, xmtp?.client]);
  
  // Reset selected answer when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setFeedback(null);
    setIsAudioPlaying(false);
    setIsAudioLoading(false);
    setIsAudioFinished(false);
    setAudioHasPlayed(false);
    setIsValidating(false);
    
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load();
    }
  }, [currentIndex]);
  
  // Effect to initialize FSRS service
  useEffect(() => {
    if (song && address) {
      console.log('FSRS service will be used for song:', song.id);
      // Note: FSRSService doesn't have an explicit init method
      // It will be used when needed with the user's address and song ID
    }
  }, [song, address]);
  
  // Effect to log FSRS data for debugging
  useEffect(() => {
    if (song && address) {
      console.log('Logging FSRS data for debugging...');
      
      // Log FSRS progress
      logFsrsProgress(address, song.id.toString())
        .then(data => {
          if (data) {
            console.log('FSRS progress data logged successfully');
          } else {
            console.warn('No FSRS progress data found or error logging data');
          }
        })
        .catch(error => {
          console.error('Error logging FSRS progress:', error);
        });
      
      // Log raw Irys data
      logIrysData(address, song.id.toString())
        .then(data => {
          if (data) {
            console.log('Raw Irys data logged successfully');
          } else {
            console.warn('No raw Irys data found or error logging data');
          }
        })
        .catch(error => {
          console.error('Error logging raw Irys data:', error);
        });
    }
  }, [song, address]);
  
  // Handle when a user selects an answer
  const handleAnswerSelect = async (answer: 'a' | 'b' | 'c' | 'd') => {
    if (!currentQuestion) {
      console.error('No current question to answer');
      return;
    }
    
    setIsValidating(true);
    setSelectedAnswer(answer);
    
    try {
      // Send the answer to the bot and get the response
      const botResponse = await sendAnswerToBot(answer, currentQuestion.uuid);
      
      let parsedResponse: QuestionAnswerResponse | null = null;
      
      if (botResponse) {
        // Try to parse the response
        try {
          if (typeof botResponse === 'string') {
            parsedResponse = JSON.parse(botResponse);
          } else if (typeof botResponse === 'object') {
            parsedResponse = botResponse;
          }
          
          // Ensure the response has the uuid property
          if (parsedResponse && !parsedResponse.uuid) {
            parsedResponse.uuid = currentQuestion.uuid;
          }
          
          console.log('Parsed bot response:', parsedResponse);
        } catch (parseError) {
          console.error('Error parsing bot response:', parseError);
          
          // If we can't parse it, create a basic response based on the content
          const responseText = typeof botResponse === 'string' ? botResponse : JSON.stringify(botResponse);
          parsedResponse = {
            isCorrect: responseText.toLowerCase().includes('correct'),
            explanation: responseText,
            answer: 'a', // Default to 'a' if we can't determine
            uuid: currentQuestion.uuid
          };
        }
      } else {
        console.log('No response from bot, using fallback');
        // Create a fallback response
        parsedResponse = {
          isCorrect: answer === 'a', // Assume 'a' is correct in offline mode
          explanation: 'Could not get response from the bot. Assuming option A is correct.',
          answer: 'a',
          uuid: currentQuestion.uuid
        };
      }
      
      // Determine if the answer is correct
      const isCorrect = parsedResponse?.isCorrect ?? false;
      
      // Update the feedback message
      setFeedback({
        isCorrect,
        explanation: parsedResponse?.explanation || (isCorrect ? 'Correct!' : 'Incorrect'),
        audioCid: parsedResponse?.audio_cid
      });
      
      // Play audio feedback
      if (isCorrect) {
        // Only try to play audio if it exists
        if (parsedResponse?.audio_cid) {
          playAudio(parsedResponse.audio_cid);
        } else {
          // Play a local correct audio if no specific audio is provided
          const feedbackAudios = [
            '/audio/feedback/very-good-hen-hao.mp3',
            '/audio/feedback/excellent-fei-chang-hao.mp3',
            '/audio/feedback/good-job-zuo-de-hao.mp3'
          ];
          const randomAudio = feedbackAudios[Math.floor(Math.random() * feedbackAudios.length)];
          playAudio(randomAudio);
        }
      } else {
        // Play incorrect sound
        playAudio('/audio/feedback/try-again-zai-lai-yi-ci.mp3');
      }
      
      // Update the FSRS card
      const currentCard = fsrsCards.get(currentQuestion.uuid);
      try {
        if (currentCard) {
          const rating = isCorrect ? 4 : 1; // 4 for correct, 1 for incorrect
          const updatedCard = await fsrsService.updateCard(currentCard, rating);
          
          // Store the answer with FSRS data
          setQuestionAnswers(prev => [
            ...prev,
            {
              uuid: currentQuestion.uuid,
              selectedAnswer: answer,
              isCorrect,
              timestamp: Date.now(),
              fsrs: updatedCard
            }
          ]);
          
          setFsrsCards(prev => {
            const newCards = new Map(prev);
            newCards.set(currentQuestion.uuid, updatedCard);
            return newCards;
          });
        } else {
          console.warn('No current card available for FSRS update');
          
          // Still store the answer without FSRS data
          setQuestionAnswers(prev => [
            ...prev,
            {
              uuid: currentQuestion.uuid,
              selectedAnswer: answer,
              isCorrect,
              timestamp: Date.now(),
              fsrs: undefined
            }
          ]);
        }
      } catch (fsrsError) {
        console.error('Error updating FSRS card:', fsrsError);
      }
      
      // Show the feedback for 2 seconds, then load the next question
      setTimeout(() => {
        setIsValidating(false);
        setSelectedAnswer(null);
        setFeedback(null);
        
        // Load the next question
        goToNextQuestion();
      }, 2000);
    } catch (error) {
      console.error('Error handling answer selection:', error);
      setIsValidating(false);
      setSelectedAnswer(null);
      setFeedback(null);
    }
  };
  
  // Function to send an answer to the bot and get a response
  const sendAnswerToBot = async (answer: string, questionUuid: string): Promise<any> => {
    if (!xmtp || !xmtp.client) {
      console.error('XMTP client not available');
      return null;
    }
    
    try {
      // Create or get the bot conversation
      const botConversation = await xmtp.createBotConversation();
      if (!botConversation) {
        console.error('Failed to create bot conversation');
        return null;
      }
      
      // Log conversation capabilities for debugging
      console.log('Conversation capabilities:', {
        hasStream: typeof botConversation.stream === 'function',
        hasOn: typeof botConversation.on === 'function',
        hasAddEventListener: typeof botConversation.addEventListener === 'function',
        hasMessages: typeof botConversation.messages === 'function',
        hasSend: typeof botConversation.send === 'function'
      });
      
      // Prepare the message to send
      const messageContent = JSON.stringify({
        type: 'answer',
        answer,
        uuid: questionUuid
      });
      
      console.log('Sending message to bot:', messageContent);
      
      // Try to send the message directly first
      if (typeof botConversation.send === 'function') {
        try {
          await botConversation.send(messageContent);
          console.log('Message sent to bot successfully using conversation.send()');
        } catch (sendError) {
          console.error('Error sending message with conversation.send():', sendError);
          
          // Fallback to context sendMessage if available
          if (xmtp.sendMessage && typeof xmtp.sendMessage === 'function') {
            await xmtp.sendMessage(botConversation, messageContent);
            console.log('Message sent to bot successfully using context.sendMessage()');
          } else {
            throw sendError; // Re-throw if we can't send
          }
        }
      } else if (xmtp.sendMessage && typeof xmtp.sendMessage === 'function') {
        // Use the context method if conversation.send is not available
        await xmtp.sendMessage(botConversation, messageContent);
        console.log('Message sent to bot successfully using context.sendMessage()');
      } else {
        throw new Error('No method available to send messages');
      }
      
      // Wait for the bot to respond (up to 15 seconds)
      const response = await waitForBotResponse(botConversation, 15000);
      if (!response) {
        console.log('No response received from bot within timeout');
        
        // Try to manually fetch recent messages as a fallback
        console.log('Trying to manually fetch recent messages as fallback...');
        try {
          const messages = await botConversation.messages();
          console.log(`Fetched ${messages.length} messages manually`);
          
          // Look for very recent messages from the bot (last 10 seconds)
          const recentTime = new Date(Date.now() - 10000); // 10 seconds ago
          const recentBotMessages = messages.filter((msg: any) => 
            msg.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase() && 
            new Date(msg.sent) > recentTime
          );
          
          if (recentBotMessages.length > 0) {
            // Sort by timestamp to get the most recent message
            recentBotMessages.sort((a: any, b: any) => 
              new Date(b.sent).getTime() - new Date(a.sent).getTime()
            );
            const latestMessage = recentBotMessages[0];
            console.log('Found recent bot message in fallback:', latestMessage.content);
            return latestMessage.content;
          } else {
            console.log('No recent bot messages found in fallback');
          }
        } catch (fallbackError) {
          console.error('Error in fallback message fetch:', fallbackError);
        }
        
        return null;
      }
      
      return response;
    } catch (error) {
      console.error('Error sending answer to bot:', error);
      return null;
    }
  };
  
  // Helper function to wait for the bot's response
  const waitForBotResponse = async (conversation: any, timeout: number): Promise<any> => {
    console.log('Waiting for bot response...');
    
    // First, check if there are any existing messages that might be the response
    // This helps in case the message arrived before we set up our listener
    try {
      console.log('Checking for existing messages...');
      const existingMessages = await conversation.messages();
      console.log(`Found ${existingMessages.length} existing messages`);
      
      // Look for recent messages from the bot (last 30 seconds)
      const recentTime = new Date(Date.now() - 30000); // 30 seconds ago
      const recentBotMessages = existingMessages.filter((msg: any) => 
        msg.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase() && 
        new Date(msg.sent) > recentTime
      );
      
      if (recentBotMessages.length > 0) {
        // Sort by timestamp to get the most recent message
        recentBotMessages.sort((a: any, b: any) => 
          new Date(b.sent).getTime() - new Date(a.sent).getTime()
        );
        const latestMessage = recentBotMessages[0];
        console.log('Found recent bot message:', latestMessage.content);
        return latestMessage.content;
      }
    } catch (error) {
      console.error('Error checking existing messages:', error);
    }
    
    return new Promise((resolve) => {
      let timeoutId: NodeJS.Timeout;
      let streamCleanup: (() => void) | null = null;
      
      // Set up timeout
      timeoutId = setTimeout(() => {
        console.log('Bot response timeout reached');
        if (streamCleanup) streamCleanup();
        resolve(null);
      }, timeout);
      
      // Try multiple approaches to receive messages
      const setupMessageListener = async () => {
        try {
          console.log('Setting up message listener for bot responses');
          
          // Approach 1: Try using the stream method (XMTP v3 style)
          if (conversation.stream && typeof conversation.stream === 'function') {
            try {
              const stream = conversation.stream((error: Error | null, message: any) => {
                if (error) {
                  console.error('Error in message stream:', error);
                  return;
                }
                
                if (!message) {
                  console.log('No message received from stream');
                  return;
                }
                
                console.log('Received message from stream:', message);
                
                // Check if this is a response from the bot
                if (message.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
                  clearTimeout(timeoutId);
                  if (streamCleanup) streamCleanup();
                  resolve(message.content);
                }
              });
              
              // Set up cleanup function
              if (stream && typeof stream.unsubscribe === 'function') {
                streamCleanup = () => stream.unsubscribe();
              }
              return;
            } catch (streamError) {
              console.error('Error setting up stream:', streamError);
            }
          }
          
          // Approach 2: Try using the streamAllMessages method (XMTP v2 style)
          if (conversation.client && conversation.client.conversations && 
              typeof conversation.client.conversations.streamAllMessages === 'function') {
            try {
              console.log('Trying streamAllMessages approach');
              const allMessagesStream = await conversation.client.conversations.streamAllMessages();
              
              // Set up an async iterator to process messages
              (async () => {
                try {
                  for await (const message of allMessagesStream) {
                    console.log('Received message from streamAllMessages:', message);
                    
                    // Check if this message is from our conversation and from the bot
                    if (message.conversation && message.conversation.topic === conversation.topic &&
                        message.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
                      clearTimeout(timeoutId);
                      if (streamCleanup) streamCleanup();
                      resolve(message.content);
                      break;
                    }
                  }
                } catch (iteratorError) {
                  console.error('Error in streamAllMessages iterator:', iteratorError);
                }
              })();
              
              // Set up cleanup function
              streamCleanup = () => {
                if (allMessagesStream && typeof allMessagesStream.return === 'function') {
                  allMessagesStream.return();
                }
              };
              return;
            } catch (streamAllError) {
              console.error('Error setting up streamAllMessages:', streamAllError);
            }
          }
          
          // Approach 3: Try using the on method (event emitter style)
          if (conversation.on && typeof conversation.on === 'function') {
            try {
              console.log('Trying event emitter approach with .on()');
              const messageHandler = (message: any) => {
                console.log('Received message from event emitter:', message);
                
                // Check if this is a response from the bot
                if (message.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
                  clearTimeout(timeoutId);
                  if (conversation.off && typeof conversation.off === 'function') {
                    conversation.off('message', messageHandler);
                  }
                  resolve(message.content);
                }
              };
              
              conversation.on('message', messageHandler);
              
              // Set up cleanup function
              streamCleanup = () => {
                if (conversation.off && typeof conversation.off === 'function') {
                  conversation.off('message', messageHandler);
                }
              };
              return;
            } catch (onError) {
              console.error('Error setting up on event listener:', onError);
            }
          }
          
          // Approach 4: Try using addEventListener (DOM-style event listener)
          if (conversation.addEventListener && typeof conversation.addEventListener === 'function') {
            try {
              console.log('Trying DOM-style event listener approach');
              const messageHandler = (event: any) => {
                const message = event.detail || event;
                console.log('Received message from addEventListener:', message);
                
                // Check if this is a response from the bot
                if (message.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()) {
                  clearTimeout(timeoutId);
                  conversation.removeEventListener('message', messageHandler);
                  resolve(message.content);
                }
              };
              
              conversation.addEventListener('message', messageHandler);
              
              // Set up cleanup function
              streamCleanup = () => {
                conversation.removeEventListener('message', messageHandler);
              };
              return;
            } catch (addEventListenerError) {
              console.error('Error setting up addEventListener:', addEventListenerError);
            }
          }
          
          // If we get here, none of the approaches worked
          console.log('Conversation does not support message listeners');
          
          // Set up polling as a last resort
          let pollCount = 0;
          const maxPolls = 15; // Poll for 15 seconds max (1 second intervals)
          
          const pollForMessages = async () => {
            try {
              console.log('Checking for existing messages...');
              const messages = await conversation.messages();
              console.log(`Found ${messages.length} existing messages`);
              
              // Look for very recent messages from the bot (last 5 seconds)
              const recentTime = new Date(Date.now() - 5000); // 5 seconds ago
              const recentBotMessages = messages.filter((msg: any) => 
                msg.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase() && 
                new Date(msg.sent) > recentTime
              );
              
              if (recentBotMessages.length > 0) {
                // Sort by timestamp to get the most recent message
                recentBotMessages.sort((a: any, b: any) => 
                  new Date(b.sent).getTime() - new Date(a.sent).getTime()
                );
                const latestMessage = recentBotMessages[0];
                console.log('Found recent bot message in poll:', latestMessage.content);
                clearTimeout(timeoutId);
                resolve(latestMessage.content);
                return;
              }
              
              // Continue polling if we haven't reached the max
              pollCount++;
              if (pollCount < maxPolls) {
                setTimeout(pollForMessages, 1000);
              }
            } catch (pollError) {
              console.error('Error polling for messages:', pollError);
              pollCount++;
              if (pollCount < maxPolls) {
                setTimeout(pollForMessages, 1000);
              }
            }
          };
          
          // Start polling
          pollForMessages();
        } catch (setupError) {
          console.error('Error setting up message listeners:', setupError);
        }
      };
      
      // Start the listener setup
      setupMessageListener();
    });
  };
  
  const playAudio = (src: string) => {
    // Don't play if audio has already played for this feedback
    if (audioHasPlayed) return;
    
    setIsAudioLoading(true);
    
    // Clean up any existing audio element
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
    } else {
      audioRef.current = new Audio();
    }
    
    // Determine if this is an IPFS CID or a local file
    let audioSrc;
    if (src.startsWith('/')) {
      // Local file path
      audioSrc = src;
    } else if (src.startsWith('bafy') || src.startsWith('bafk')) {
      // This is an IPFS CID - use the proxy route to avoid CORS issues
      audioSrc = `/ipfs/${src}`;
    } else {
      // Fallback to direct URL if it's not a CID format
      audioSrc = src;
    }
    
    console.log('Loading audio from:', audioSrc);
    audioRef.current.src = audioSrc;
    audioRef.current.crossOrigin = "anonymous"; // Add crossOrigin attribute
    
    // Set up event listeners
    audioRef.current.onloadeddata = () => {
      console.log('Audio loaded successfully');
      setIsAudioLoading(false);
      setIsAudioPlaying(true);
      audioRef.current?.play().catch(error => {
        console.error('Error playing audio after load:', error);
        setIsAudioPlaying(false);
        setIsAudioLoading(false);
        
        // Try fallback gateway if proxy fails
        if (!src.startsWith('/') && !audioSrc.includes('ipfs.io')) {
          console.log('Trying fallback IPFS gateway');
          tryFallbackGateway(src);
        }
      });
    };
    
    audioRef.current.onended = () => {
      console.log('Audio playback ended');
      setIsAudioPlaying(false);
      setIsAudioFinished(true);
      setAudioHasPlayed(true);
    };
    
    audioRef.current.onerror = (e) => {
      console.error('Audio error:', e);
      setIsAudioLoading(false);
      setIsAudioPlaying(false);
      
      // Try fallback gateway if proxy fails
      if (!src.startsWith('/')) {
        console.log('Error loading audio, trying fallback IPFS gateway');
        tryFallbackGateway(src);
      }
    };
    
    // Add a timeout to handle cases where the audio doesn't load
    setTimeout(() => {
      if (isAudioLoading) {
        console.log('Audio loading timeout - resetting state');
        setIsAudioLoading(false);
        
        // Try fallback gateway if proxy times out
        if (!src.startsWith('/')) {
          console.log('Timeout loading audio, trying fallback IPFS gateway');
          tryFallbackGateway(src);
        }
      }
    }, 5000);
    
    // Load the audio
    audioRef.current.load();
  };
  
  // Helper function to try different IPFS gateways
  const tryFallbackGateway = (cid: string) => {
    if (!audioRef.current) return;
    
    // Try different gateways in sequence
    const gateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://cloudflare-ipfs.com/ipfs/${cid}`,
      `https://gateway.pinata.cloud/ipfs/${cid}`
    ];
    
    // Use the first gateway in the list
    const fallbackSrc = gateways[0];
    console.log('Using fallback gateway:', fallbackSrc);
    
    audioRef.current.src = fallbackSrc;
    audioRef.current.crossOrigin = "anonymous"; // Add crossOrigin attribute
    audioRef.current.load();
  };
  
  const handleToggleAudio = () => {
    if (!audioRef.current) return;
    
    // Check if we have an audio CID in the feedback or if we're using a local audio file
    const hasAudio = feedback?.audioCid || feedback?.isCorrect;
    if (!hasAudio) return;
    
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
      // If audio has already finished playing once, we need to reset it
      if (isAudioFinished) {
        audioRef.current.currentTime = 0;
      }
      
      // If we have an audioCid but haven't loaded it yet, load it now
      if (feedback?.audioCid && !audioHasPlayed) {
        playAudio(feedback.audioCid);
        return;
      }
      
      // Only set loading if we're actually going to play
      setIsAudioLoading(true);
      
      audioRef.current.play()
        .then(() => {
          setIsAudioPlaying(true);
          setIsAudioLoading(false);
        })
        .catch(err => {
          console.error('Failed to play audio:', err);
          setIsAudioLoading(false);
          
          // If there was an error playing, try loading again with the IPFS gateway
          if (feedback?.audioCid) {
            // Try with a different gateway
            playAudio(feedback.audioCid);
          }
        });
    }
  };
  
  const handleNextQuestion = () => {
    if (currentIndex < totalQuestions - 1) {
      goToNextQuestion();
    } else {
      // All questions completed, save stats and redirect to confirmation page
      const correctAnswers = questionAnswers.filter(q => q.isCorrect).length;
      
      console.log('StudyPage: All questions completed, preparing stats');
      console.log('StudyPage: Total questions:', totalQuestions);
      console.log('StudyPage: Correct answers:', correctAnswers);
      console.log('StudyPage: Question answers array length:', questionAnswers.length);
      console.log('StudyPage: First few question answers:', questionAnswers.slice(0, 3));
      
      // Save stats to localStorage for the confirmation page
      const stats = {
        totalQuestions,
        correctAnswers,
        songId: song?.id,
        completedAt: Date.now(),
        questions: questionAnswers
      };
      
      console.log('StudyPage: Stats object prepared:', stats);
      
      try {
        console.log('StudyPage: Saving stats to localStorage');
        localStorage.setItem('questionStats', JSON.stringify(stats));
        localStorage.setItem('questionAnswers', JSON.stringify(questionAnswers));
        console.log('StudyPage: Stats saved to localStorage successfully');
      } catch (err) {
        console.error('StudyPage: Error saving stats to localStorage:', err);
      }
      
      // Redirect to confirmation page
      console.log('StudyPage: Redirecting to confirmation page with stats');
      navigate(`/song/${title}/confirmation`, { state: { stats } });
    }
  };
  
  // Add a function to toggle the debug panel
  const toggleDebugPanel = () => {
    setShowDebugPanel(prev => !prev);
  };
  
  const loading = songLoading || questionsLoading;
  const error = songError || questionsError;
  
  // Return the loading state if content is still loading
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink={`/song/${title}`}
          title={t('study.loading')}
        />
        <div className="flex justify-center items-center h-64">
          <Spinner size="lg" />
        </div>
      </div>
    );
  }
  
  // Return error state if there's an error
  if (error || !song) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink={`/song/${title}`}
          title={t('study.error')}
        />
        <div className="bg-red-900 bg-opacity-30 text-red-300 p-4 rounded-lg mt-4">
          {error ? (error instanceof Error ? error.message : String(error)) : t('study.songNotFound')}
        </div>
      </div>
    );
  }
  
  // If XMTP is not connected, show a simple connect screen
  if (!isXmtpReady) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink={`/song/${title}`}
          title={song?.song_title || t('loading')}
        />
        
        <div className="flex flex-col items-center justify-center py-12">
          <h2 className="text-xl font-bold mb-4">{t('study.connectToStart')}</h2>
          <p className="text-neutral-400 mb-6 text-center max-w-md">
            {t('chat.xmtpExplanation')}
          </p>
          
          <button
            onClick={() => {
              if (xmtp && !isXmtpConnecting) {
                setIsXmtpConnecting(true);
                setXmtpConnectionError(null);
                
                // Add a timeout to prevent getting stuck in connecting state
                const connectionTimeout = setTimeout(() => {
                  console.log('XMTP connection attempt timed out');
                  setIsXmtpConnecting(false);
                  setXmtpConnectionError(t('study.xmtpConnectionTimeout'));
                }, 15000); // 15 second timeout
                
                try {
                  console.log('Attempting to connect to XMTP...');
                  
                  if (xmtp.client) {
                    console.log('XMTP client already exists, setting ready state');
                    clearTimeout(connectionTimeout);
                    setIsXmtpConnecting(false);
                    setIsXmtpReady(true);
                    return;
                  }
                  
                  // Try connectWithEthers first, then fall back to connectWithWagmi
                  if (xmtp.connectWithEthers) {
                    xmtp.connectWithEthers()
                      .then(connected => {
                        clearTimeout(connectionTimeout);
                        setIsXmtpConnecting(false);
                        
                        // Even if connected is false, check if client exists
                        if (xmtp.client) {
                          console.log('XMTP client exists after connection attempt');
                          setIsXmtpReady(true);
                          return;
                        }
                        
                        if (!connected) {
                          console.error('Failed to connect to XMTP with ethers, trying wagmi as fallback');
                          // Try wagmi as fallback
                          if (xmtp.connectWithWagmi) {
                            xmtp.connectWithWagmi()
                              .then(wagmiConnected => {
                                if (xmtp.client || wagmiConnected) {
                                  console.log('XMTP connected with wagmi fallback');
                                  setIsXmtpReady(true);
                                } else {
                                  console.error('Failed to connect to XMTP with wagmi fallback');
                                  setXmtpConnectionError(t('study.xmtpConnectionFailed'));
                                }
                              })
                              .catch(wagmiError => {
                                console.error('Error connecting to XMTP with wagmi fallback:', wagmiError);
                                setXmtpConnectionError(wagmiError instanceof Error ? wagmiError.message : String(wagmiError));
                              });
                          } else {
                            setXmtpConnectionError(t('study.xmtpConnectionFailed'));
                          }
                        } else {
                          setIsXmtpReady(true);
                        }
                      })
                      .catch(error => {
                        console.error('Error connecting to XMTP with ethers:', error);
                        clearTimeout(connectionTimeout);
                        setIsXmtpConnecting(false);
                        
                        // Try wagmi as fallback
                        console.log('Trying wagmi as fallback after ethers error');
                        if (xmtp.connectWithWagmi) {
                          xmtp.connectWithWagmi()
                            .then(wagmiConnected => {
                              if (xmtp.client || wagmiConnected) {
                                console.log('XMTP connected with wagmi fallback');
                                setIsXmtpReady(true);
                              } else {
                                console.error('Failed to connect to XMTP with wagmi fallback');
                                setXmtpConnectionError(t('study.xmtpConnectionFailed'));
                              }
                            })
                            .catch(wagmiError => {
                              console.error('Error connecting to XMTP with wagmi fallback:', wagmiError);
                              setXmtpConnectionError(wagmiError instanceof Error ? wagmiError.message : String(wagmiError));
                            });
                        } else {
                          setXmtpConnectionError(error instanceof Error ? error.message : String(error));
                        }
                      });
                  } else if (xmtp.connectWithWagmi) {
                    xmtp.connectWithWagmi()
                      .then(connected => {
                        clearTimeout(connectionTimeout);
                        setIsXmtpConnecting(false);
                        
                        // Even if connected is false, check if client exists
                        if (xmtp.client) {
                          console.log('XMTP client exists after connection attempt');
                          setIsXmtpReady(true);
                          return;
                        }
                        
                        if (!connected) {
                          console.error('Failed to connect to XMTP');
                          setXmtpConnectionError(t('study.xmtpConnectionFailed'));
                        } else {
                          setIsXmtpReady(true);
                        }
                      })
                      .catch(error => {
                        console.error('Error connecting to XMTP:', error);
                        clearTimeout(connectionTimeout);
                        setIsXmtpConnecting(false);
                        setXmtpConnectionError(error instanceof Error ? error.message : String(error));
                      });
                  }
                } catch (error) {
                  console.error('Failed to connect to XMTP:', error);
                  clearTimeout(connectionTimeout);
                  setIsXmtpConnecting(false);
                  setXmtpConnectionError(error instanceof Error ? error.message : String(error));
                }
              }
            }}
            disabled={isXmtpConnecting}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center min-w-[200px]"
          >
            {isXmtpConnecting ? (
              <>
                <div className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2" />
                {t('connecting')}
              </>
            ) : (
              t('study.connectMessaging')
            )}
          </button>
          
          {xmtpConnectionError && (
            <div className="mt-4 p-4 bg-red-900/20 border border-red-700 rounded-lg text-red-400 max-w-md">
              <p className="text-sm">{xmtpConnectionError}</p>
              <button 
                onClick={() => {
                  setXmtpConnectionError(null);
                }}
                className="mt-2 text-sm text-blue-400 hover:text-blue-300"
              >
                {t('retry')}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
  
  // Main content - only shown when XMTP is connected
  return (
    <div className="container mx-auto px-4 py-6 min-h-screen flex flex-col">
      <PageHeader
        leftIcon={<CaretLeft size={24} />}
        leftLink={`/song/${title}`}
        title={song.song_title}
        rightIcon={
          <button 
            onClick={toggleDebugPanel}
            className="p-1 text-xs bg-neutral-700 hover:bg-neutral-600 text-neutral-300 rounded"
            title="Debug FSRS Data"
          >
            Debug
          </button>
        }
      />
      
      <div className="text-sm text-neutral-400 mb-4">
        {currentIndex + 1} / {totalQuestions}
      </div>
      
      {/* Page header with back button and progress bar */}
      <div className="mb-8 flex items-center gap-4">
        <Link
          to={`/song/${title}`}
          className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
        >
          <CaretLeft size={24} />
        </Link>
        
        {/* Progress bar - now in header */}
        <div className="h-2 bg-neutral-800 rounded-full flex-1">
          <div 
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
          />
        </div>
      </div>
      
      {/* Main content area with fixed heights to prevent layout shifts */}
      <div className="grid grid-rows-[auto_1fr] gap-4 min-h-[calc(100vh-250px)]">
        {/* Top section with avatar, question and feedback - fixed height */}
        <div className="grid md:grid-cols-[auto_1fr] gap-4">
          {/* Avatar - centered on mobile, left on desktop */}
          <div className="flex justify-center md:block md:pr-4">
            <img 
              src="/images/scarlett-peace.png" 
              alt="Scarlett"
              className="w-24 h-24 rounded-full object-cover"
            />
          </div>
          
          {/* Messages Container - fixed height to prevent layout shifts */}
          <div className="flex flex-col gap-4">
            {/* Question Message */}
            <div className="p-4 rounded-lg bg-neutral-800 w-full flex items-center min-h-[80px]">
              <p className="text-md text-white">
                {currentQuestion?.question || t('study.loading')}
              </p>
            </div>
            
            {/* Feedback Message Container - Fixed height container */}
            <div className="h-[100px] w-full relative">
              {/* Actual feedback content with absolute positioning */}
              <div className={`absolute inset-0 p-4 rounded-lg bg-neutral-800 transition-opacity duration-300 ${!feedback ? 'opacity-0' : 'opacity-100'}`}>
                {feedback && (
                  <>
                    {/* Explanation text with padding to avoid button overlap */}
                    <div className="pr-12">
                      <p className="text-md text-white">
                        {feedback.explanation}
                      </p>
                    </div>
                    
                    {/* Audio button positioned at bottom right to avoid text overlap */}
                    {isValidating ? (
                      <div className="absolute bottom-3 right-3">
                        <div className="w-8 h-8 flex items-center justify-center">
                          <Spinner size="sm" color="primary" />
                        </div>
                      </div>
                    ) : feedback.audioCid && (
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={handleToggleAudio}
                          disabled={isAudioLoading}
                          className="p-1 rounded-full bg-neutral-700 hover:bg-neutral-600 transition-colors w-8 h-8 flex items-center justify-center"
                          aria-label={isAudioPlaying ? "Pause audio" : "Play audio"}
                        >
                          {isAudioLoading ? (
                            // Custom spinner that matches the XMTP loading spinner
                            <div 
                              className="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                              role="status"
                              aria-label="Loading"
                            />
                          ) : isAudioPlaying ? (
                            <Pause size={16} weight="fill" className="text-white" />
                          ) : (
                            <Play size={16} weight="fill" className="text-white" />
                          )}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        
        {/* Answer Options - in a separate container that doesn't shift */}
        <div className="space-y-2 mt-4">
          {['a', 'b', 'c', 'd'].map((option) => (
            <button
              key={option}
              onClick={() => handleAnswerSelect(option as 'a' | 'b' | 'c' | 'd')}
              disabled={!!selectedAnswer || isValidating}
              className={`w-full text-left p-6 rounded-lg flex items-start transition-colors text-lg ${
                selectedAnswer === option
                  ? currentQuestion?.userAnswer === option && currentQuestion?.isCorrect
                    ? 'bg-green-900/30 border border-green-700'
                    : currentQuestion?.userAnswer === option
                    ? 'bg-red-900/30 border border-red-700'
                    : 'bg-blue-900/30 border border-blue-700'
                  : 'bg-neutral-800 hover:bg-neutral-700'
              } ${!!selectedAnswer || isValidating ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <span className="py-2">{currentQuestion?.options ? currentQuestion.options[option as keyof typeof currentQuestion.options] : ''}</span>
            </button>
          ))}
        </div>
      </div>
          
      {/* Navigation buttons - fixed at bottom - UPDATED COLOR AND LOCALIZATION */}
      {selectedAnswer && !isValidating && (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 p-4">
          <div className="container mx-auto">
            <button
              onClick={handleNextQuestion}
              disabled={!selectedAnswer || isValidating}
              className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-blue-500 text-white text-lg ${
                !selectedAnswer || isValidating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600'
              }`}
            >
              {currentIndex === totalQuestions - 1 ? t('study.finish') : t('study.next')}
              <ArrowRight size={20} weight="bold" />
            </button>
          </div>
        </div>
      )}
      
      {/* Hidden audio element for playing sounds */}
      <audio ref={audioRef} className="hidden" />
      
      {/* Add the debug panel */}
      {showDebugPanel && (
        <FsrsDebugPanel 
          songId={String(song.id)} 
          onClose={() => setShowDebugPanel(false)} 
        />
      )}
    </div>
  );
};

export default StudyPage; 