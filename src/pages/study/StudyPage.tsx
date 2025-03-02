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
import { fsrsService, FSRSUserProgress } from '../../lib/fsrs/client';
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
    resetQuestions,
    questions
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
  const [fsrsProgress, setFsrsProgress] = useState<FSRSUserProgress | null>(null);
  
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
  
  // Effect to initialize FSRS service and load previous progress
  useEffect(() => {
    if (song && address) {
      console.log('FSRS service will be used for song:', song.id);
      
      // Load previous progress from Irys
      const loadFsrsProgress = async () => {
        try {
          console.log(`Loading FSRS progress for user ${address} and song ${song.id}`);
          const progress = await fsrsService.getLatestProgress(address, song.id.toString());
          
          if (progress) {
            console.log(`Found previous FSRS progress with ${progress.questions.length} questions`);
            setFsrsProgress(progress);
            
            // Initialize FSRS cards from progress
            const cards = new Map<string, any>();
            progress.questions.forEach(q => {
              if (q.fsrs) {
                cards.set(q.uuid, q.fsrs);
              }
            });
            
            console.log(`Initialized ${cards.size} FSRS cards from previous progress`);
            setFsrsCards(cards);
          } else {
            console.log('No previous FSRS progress found');
          }
        } catch (error) {
          console.error('Error loading FSRS progress:', error);
        }
      };
      
      loadFsrsProgress();
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
  
  // Modify the useQuestions hook usage to apply FSRS ordering
  useEffect(() => {
    if (!song || !questions || questions.length === 0 || !fsrsProgress) {
      // Skip if we don't have questions or FSRS progress yet
      return;
    }
    
    const applyFsrsOrdering = async () => {
      try {
        console.log('Applying FSRS ordering to questions');
        
        // Use the FSRS service to select questions
        const orderedQuestions = await fsrsService.selectQuestions(questions);
        
        if (orderedQuestions && orderedQuestions.length > 0) {
          console.log(`FSRS ordered ${orderedQuestions.length} questions`);
          
          // Since we can't directly set questions from the hook, we need to reset and
          // then update each question individually or use a different approach
          // This is a limitation of the current hook design
          console.log('FSRS ordering applied, but cannot directly update questions array');
          
          // Instead of trying to replace the questions array, we could:
          // 1. Use the ordered indices to navigate through questions
          // 2. Create a mapping from original index to FSRS index
          // 3. Modify the useQuestions hook to accept an ordering array
          
          // For now, log that we can't directly update the questions
          console.log('Consider modifying the useQuestions hook to support reordering');
        } else {
          console.log('FSRS did not return any ordered questions, keeping original order');
        }
      } catch (error) {
        console.error('Error applying FSRS ordering:', error);
      }
    };
    
    applyFsrsOrdering();
  }, [questions, fsrsProgress, song]);
  
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
      
      // Prepare the message to send with the correct JSON structure
      const questionRequest = {
        uuid: questionUuid,
        selectedAnswer: answer,
        songId: song?.id.toString() || "1"  // Ensure we have a songId
      };
      
      const messageContent = JSON.stringify(questionRequest);
      console.log('Sending message to bot:', messageContent);
      
      // Send the message
      if (typeof botConversation.send === 'function') {
        try {
          await botConversation.send(messageContent);
          console.log('Message sent to bot successfully using conversation.send()');
        } catch (sendError) {
          console.error('Error sending message with conversation.send():', sendError);
          
          // Fallback to context sendMessage if available
          if (xmtp.sendMessage && typeof xmtp.sendMessage === 'function') {
            await xmtp.sendMessage(botConversation.topic || botConversation.id, messageContent);
            console.log('Message sent to bot successfully using context.sendMessage()');
          } else {
            throw sendError; // Re-throw if we can't send
          }
        }
      } else if (xmtp.sendMessage && typeof xmtp.sendMessage === 'function') {
        // Use the context method if conversation.send is not available
        await xmtp.sendMessage(botConversation.topic || botConversation.id, messageContent);
        console.log('Message sent to bot successfully using context.sendMessage()');
      } else {
        throw new Error('No method available to send messages');
      }
      
      // Wait for response using the original working approach
      return new Promise((resolve) => {
        // Set a timeout to check for messages after a delay
        setTimeout(async () => {
          try {
            const messages = await botConversation.messages();
            console.log('Retrieved messages:', messages.length);
            
            // Log the last few messages for debugging
            const lastFewMessages = messages.slice(-5);
            console.log('Last few messages:', lastFewMessages.map((msg: any) => {
              // Safely format the date
              let formattedDate = 'Invalid date';
              try {
                // Check if sent is a valid date
                const sentDate = msg.sent instanceof Date ? msg.sent : new Date(msg.sent);
                // Verify the date is valid before calling toISOString()
                formattedDate = !isNaN(sentDate.getTime()) ? sentDate.toISOString() : 'Invalid date';
              } catch (e) {
                console.log('Error formatting message date:', e);
              }
              
              return {
                sender: msg.senderAddress,
                content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                sent: formattedDate,
                isFromBot: msg.senderAddress?.toLowerCase() === SCARLETT_BOT_ADDRESS.toLowerCase()
              };
            }));
            
            // Find messages that contain our question UUID and a response
            // This is more reliable than trying to filter by sender
            const relevantMessages = messages
              .filter((msg: XmtpMessage) => {
                try {
                  // Try to get the content - it might be an object with a toString method
                  const content = typeof msg.content === 'string' 
                    ? msg.content 
                    : (msg.content && typeof msg.content.toString === 'function')
                      ? msg.content.toString() 
                      : JSON.stringify(msg.content, bigIntReplacer);
                  
                  // Check if this message contains our question UUID
                  return content.includes(questionUuid);
                } catch (e) {
                  console.log('Error processing message content:', e, msg);
                  return false;
                }
              })
              .sort((a: XmtpMessage, b: XmtpMessage) => {
                // Sort by sent time, newest first
                const timeA = a.sent ? new Date(a.sent).getTime() : 0;
                const timeB = b.sent ? new Date(b.sent).getTime() : 0;
                return timeB - timeA;
              });
            
            console.log('Relevant messages found:', relevantMessages.length);
            
            // Look for response messages (not our own request)
            const botAddress = SCARLETT_BOT_ADDRESS.toLowerCase();
            const responseMessages = relevantMessages.filter((msg: XmtpMessage) => {
              try {
                // Check if this message is from the bot
                // First check if senderAddress exists and matches the bot address
                if (msg.senderAddress && msg.senderAddress.toLowerCase() === botAddress) {
                  return true;
                }
                
                // If we can't determine by sender, check content
                const content = typeof msg.content === 'string' 
                  ? msg.content 
                  : JSON.stringify(msg.content, bigIntReplacer);
                
                // Check if this is a response (contains "explanation" field)
                return content.includes('explanation');
              } catch (e) {
                console.log('Error filtering response message:', e);
                return false;
              }
            });
            
            console.log('Response messages found:', responseMessages.length);
            
            if (responseMessages.length > 0) {
              // Get the most recent response
              const latestResponse = responseMessages[0];
              console.log('Latest response:', latestResponse);
              
              // Get the content as a string
              let responseContent;
              try {
                responseContent = typeof latestResponse.content === 'string' 
                  ? latestResponse.content 
                  : JSON.stringify(latestResponse.content, bigIntReplacer);
                
                console.log('Latest response content:', responseContent);
              } catch (e) {
                console.log('Error getting response content:', e);
                responseContent = '';
              }
              
              // Try to parse the message as JSON
              try {
                const responseJson = JSON.parse(responseContent);
                console.log('Parsed JSON response:', responseJson);
                
                // Check if this is a valid response for our question
                if (responseJson.uuid === questionUuid) {
                  // If the response has a "correct" field, use it to determine if the answer is correct
                  const isCorrect = responseJson.correct !== undefined 
                    ? responseJson.correct 
                    : responseJson.answer === answer;
                  
                  resolve({
                    uuid: responseJson.uuid,
                    answer: responseJson.answer || answer,
                    explanation: responseJson.explanation || 'No explanation provided',
                    audio_cid: responseJson.audio_cid,
                    isCorrect
                  });
                  return;
                }
              } catch (e) {
                console.log('Bot response is not valid JSON, using as plain text:', responseContent);
                
                // If it's not JSON, try to extract information from the text
                // This is a fallback for plain text responses
                const isCorrect = responseContent.toLowerCase().includes('correct');
                
                resolve({
                  uuid: questionUuid,
                  answer: answer,
                  explanation: responseContent || 'No explanation provided',
                  isCorrect
                });
                return;
              }
            }
            
            console.log('No valid response found, using fallback');
            // Fallback response if no valid response is found
            resolve({
              uuid: questionUuid,
              answer: 'a', // Default to 'a' as the correct answer
              explanation: 'No response received from the bot. This is a fallback explanation.',
              isCorrect: answer === 'a' // Assume 'a' is correct in offline mode
            });
          } catch (error) {
            console.error('Error getting messages:', error);
            // Fallback response on error
            resolve({
              uuid: questionUuid,
              answer: 'a', // Default to 'a' as the correct answer
              explanation: 'Error checking your answer. This is a fallback explanation.',
              isCorrect: answer === 'a' // Assume 'a' is correct in offline mode
            });
          }
        }, 3000); // Wait 3 seconds for a response
      });
    } catch (error) {
      console.error('Error sending answer to bot:', error);
      return null;
    }
  };
  
  const handleAnswerSelect = async (answer: 'a' | 'b' | 'c' | 'd') => {
    if (!currentQuestion) {
      console.error('No current question available');
      return;
    }
    
    setSelectedAnswer(answer);
    setIsValidating(true);
    setFeedback({
      isCorrect: false,
      explanation: 'Checking your answer...'
    });
    
    try {
      // Send the answer to the bot and wait for a response
      const botResponse = await sendAnswerToBot(answer, currentQuestion.uuid);
      
      console.log('Bot response received:', botResponse);
      
      let parsedResponse = null;
      
      // Try to parse the response if it's a string
      if (botResponse && typeof botResponse === 'string') {
        try {
          parsedResponse = JSON.parse(botResponse);
          console.log('Parsed string response:', parsedResponse);
        } catch (e) {
          console.error('Error parsing bot response string:', e);
        }
      } else if (botResponse && typeof botResponse === 'object') {
        // If it's already an object, use it directly
        parsedResponse = botResponse;
        console.log('Using object response directly:', parsedResponse);
      }
      
      // Create a fallback response if parsing failed or no response received
      if (!parsedResponse) {
        console.log('Using fallback response');
        parsedResponse = {
          uuid: currentQuestion.uuid,
          answer: 'a', // Default to 'a' as the correct answer
          explanation: 'No valid response received from the bot. This is a fallback explanation.',
          isCorrect: answer === 'a' // Assume 'a' is correct in offline mode
        };
      }
      
      // Ensure the response has a uuid property
      if (!parsedResponse.uuid) {
        parsedResponse.uuid = currentQuestion.uuid;
      }
      
      // Determine if the answer is correct
      const isCorrect = parsedResponse.isCorrect !== undefined 
        ? parsedResponse.isCorrect 
        : parsedResponse.answer === answer;
      
      // Update feedback with the bot's response
      setFeedback({
        isCorrect,
        explanation: parsedResponse.explanation || (isCorrect ? 'Correct!' : 'Incorrect'),
        audioCid: parsedResponse.audio_cid
      });
      
      // Play audio if available
      if (parsedResponse.audio_cid) {
        playAudio(parsedResponse.audio_cid);
      } else if (isCorrect && audioRef.current) {
        // Play a local correct audio if no specific audio is provided
        const feedbackAudios = [
          'fantastic-tai-bang-le.mp3',
          'gan-de-piaoliang-well-done.mp3',
          'hen-chuse-excellent.mp3',
          'very-good-hen-hao.mp3'
        ];
        
        const randomAudio = `/audio/feedback/${feedbackAudios[Math.floor(Math.random() * feedbackAudios.length)]}`;
        playAudio(randomAudio);
      }
      
      // Update FSRS card
      try {
        // Get the FSRS rating based on correctness
        const rating = fsrsService.rateAnswer(isCorrect);
        
        // Get the current card if it exists
        const currentCard = fsrsCards.get(currentQuestion.uuid);
        
        // Update the card with the new rating
        const updatedCard = fsrsService.updateCard(currentCard, rating);
        
        console.log('Updated FSRS card:', updatedCard);
        
        // Update the FSRS cards map
        const newFsrsCards = new Map(fsrsCards);
        newFsrsCards.set(currentQuestion.uuid, updatedCard);
        setFsrsCards(newFsrsCards);
        
        // Store the answer with FSRS data
        const newAnswer = {
          uuid: currentQuestion.uuid,
          selectedAnswer: answer,
          isCorrect,
          timestamp: Date.now(),
          fsrs: updatedCard
        };
        
        setQuestionAnswers(prev => [...prev, newAnswer]);
        
        // Update the question answer in the questions array
        setQuestionAnswer(
          currentQuestion.uuid, 
          answer, 
          isCorrect, 
          {
            uuid: currentQuestion.uuid,
            answer: parsedResponse.answer || answer,
            explanation: parsedResponse.explanation || 'No explanation provided',
            audio_cid: parsedResponse.audio_cid
          }
        );
        
        // Save progress to Irys
        if (song && address) {
          const progress = {
            userId: address,
            songId: song.id.toString(),
            questions: [...questionAnswers, newAnswer].map(q => ({
              uuid: q.uuid,
              selectedAnswer: q.selectedAnswer,
              isCorrect: q.isCorrect,
              timestamp: q.timestamp,
              fsrs: q.fsrs
            })),
            completedAt: Date.now(),
            totalQuestions: questions.length,
            correctAnswers: [...questionAnswers, newAnswer].filter(q => q.isCorrect).length,
            accuracy: [...questionAnswers, newAnswer].filter(q => q.isCorrect).length / 
                     [...questionAnswers, newAnswer].length
          };
          
          console.log('Saving progress to Irys:', progress);
          
          // Save progress asynchronously - don't wait for it to complete
          fsrsService.saveProgress(progress)
            .then(txId => {
              if (txId) {
                console.log('Progress saved to Irys with transaction ID:', txId);
              } else {
                console.warn('Failed to save progress to Irys');
              }
            })
            .catch(error => {
              console.error('Error saving progress to Irys:', error);
            });
        }
      } catch (error) {
        console.error('Error updating FSRS card:', error);
      }
      
      // Remove the automatic advancement to the next question
      // Instead, show the feedback and let the user click the Next button when ready
      setIsValidating(false);
      
    } catch (error) {
      console.error('Error in handleAnswerSelect:', error);
      setFeedback({
        isCorrect: false,
        explanation: 'Error checking your answer. Please try again.'
      });
      setIsValidating(false);
    }
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
        progressPercent={((currentIndex + 1) / totalQuestions) * 100}
      />
      
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