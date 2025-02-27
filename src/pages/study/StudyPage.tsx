import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { useQuestions } from '../../hooks/useQuestions';
import { Play, Pause, ArrowRight, X, GlobeSimple } from '@phosphor-icons/react';
import PageHeader from '../../components/layout/PageHeader';
import { useXmtp } from '../../context/XmtpContext';
import Spinner from '../../components/ui/Spinner';

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
const bigIntReplacer = (key: string, value: any) => {
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
  
  // Add state to track the selected study language (which may be different from UI language)
  const [studyLanguage, setStudyLanguage] = useState<'en' | 'zh'>(currentLanguage);
  
  // Update study language when browser language changes
  useEffect(() => {
    setStudyLanguage(currentLanguage);
  }, [currentLanguage]);
  
  // Get the appropriate questions CID based on selected study language
  const questionsCid = song ? (studyLanguage === 'en' ? song.questions_cid_2 : song.questions_cid_1) : undefined;
  
  const { 
    questions, 
    currentQuestion, 
    loading: questionsLoading, 
    error: questionsError,
    goToNextQuestion,
    setQuestionAnswer,
    currentIndex,
    totalQuestions,
    resetQuestions
  } = useQuestions(questionsCid, studyLanguage);
  
  // Reset questions when study language changes
  useEffect(() => {
    resetQuestions();
  }, [studyLanguage, resetQuestions]);
  
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
  
  // Check if XMTP is connected
  useEffect(() => {
    if (xmtp?.isConnected) {
      setIsXmtpReady(true);
    } else {
      setIsXmtpReady(false);
    }
  }, [xmtp?.isConnected]);
  
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
  
  const handleAnswerSelect = async (answer: 'a' | 'b' | 'c' | 'd') => {
    if (selectedAnswer || feedback || isValidating || !currentQuestion || !song) return;
    
    // Check if XMTP is ready
    if (!isXmtpReady) {
      setFeedback({
        isCorrect: false,
        explanation: 'XMTP connection is not ready. Please wait a moment and try again.'
      });
      return;
    }
    
    setSelectedAnswer(answer);
    setIsValidating(true);
    setFeedback({
      isCorrect: false,
      explanation: 'Checking your answer...'
    });
    
    try {
      // Prepare the JSON message to send to XMTP bot
      const questionRequest: QuestionAnswerRequest = {
        uuid: currentQuestion.uuid,
        selectedAnswer: answer,
        songId: String(song.id)
      };
      
      console.log('Sending question answer to XMTP bot:', questionRequest);
      
      // Send the JSON message to the XMTP bot
      const botResponse = await sendAnswerToBot(questionRequest);
      
      if (botResponse) {
        console.log('Received response from XMTP bot:', botResponse);
        
        // Determine if the answer is correct based on the response
        // The bot might send a "correct" field directly, or we compare the answer
        const isCorrect = botResponse.isCorrect !== undefined 
          ? botResponse.isCorrect 
          : botResponse.answer === answer;
        
        // Update feedback with the bot's response
      setFeedback({
        isCorrect,
          explanation: botResponse.explanation || (isCorrect ? 'Correct!' : 'Incorrect'),
          audioCid: botResponse.audio_cid
      });
      
      // Update question state
        setQuestionAnswer(
          currentQuestion.uuid, 
          answer, 
          isCorrect, 
          {
            uuid: currentQuestion.uuid,
            answer: botResponse.answer,
            explanation: botResponse.explanation,
            audio_cid: botResponse.audio_cid
          }
        );
        
        // Play audio if available
        if (botResponse.audio_cid) {
          playAudio(botResponse.audio_cid);
        } else if (isCorrect) {
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
      } else {
        // Fallback if no response from bot
        setFeedback({
          isCorrect: false,
          explanation: 'Could not validate your answer. Please try again.'
        });
      }
    } catch (error) {
      console.error('Error sending answer to XMTP bot:', error);
      setFeedback({
        isCorrect: false,
        explanation: 'Error checking your answer. Please try again.'
      });
    } finally {
      setIsValidating(false);
    }
  };
  
  // Function to send the answer to the XMTP bot and get a response
  const sendAnswerToBot = async (questionRequest: QuestionAnswerRequest): Promise<QuestionAnswerResponse | null> => {
    if (!xmtp || !xmtp.isConnected) {
      console.error('XMTP is not connected');
      return null;
    }
    
    try {
      // Get or create conversation with the bot
      const SCARLETT_BOT_ADDRESS = '0xc94A2d246026CedEE7d395B5B94C83aaCAd67773';
      const conversation = await xmtp.getOrCreateConversation(SCARLETT_BOT_ADDRESS);
      
      if (!conversation) {
        console.error('Failed to create conversation with bot');
        return null;
      }
      
      // Send the JSON message
      const jsonMessage = JSON.stringify(questionRequest);
      await conversation.send(jsonMessage);
      console.log('Sent JSON message to bot:', jsonMessage);
      
      // Wait for response (in a real app, you would use a message stream)
      // For now, we'll use a simple timeout and then check for new messages
      return new Promise((resolve) => {
        // Set a timeout to check for messages after a delay
        setTimeout(async () => {
          try {
            const messages = await conversation.messages();
            console.log('Retrieved messages:', messages.length);
            
            // Log a sample message to understand its structure
            if (messages.length > 0) {
              // Use a custom replacer function to handle BigInt values
              const bigIntReplacer = (key: string, value: any) => {
                // Convert BigInt to String during serialization
                if (typeof value === 'bigint') {
                  return value.toString() + 'n';
                }
                return value;
              };
              
              try {
                console.log('Sample message structure:', JSON.stringify(messages[0], bigIntReplacer));
                
                // Try to access properties using different methods
                const sampleMsg = messages[0];
                console.log('Direct properties:', Object.keys(sampleMsg));
                
                // Check if it's a class instance with getters
                if (typeof sampleMsg === 'object' && sampleMsg !== null) {
                  try {
                    // Try different ways to access the content
                    console.log('Content access attempts:');
                    console.log('- content property:', sampleMsg.content);
                    console.log('- content() method:', typeof sampleMsg.content === 'function' ? sampleMsg.content() : 'Not a function');
                    console.log('- get("content"):', typeof sampleMsg.get === 'function' ? sampleMsg.get('content') : 'No get method');
                    
                    // Try to access sender information
                    console.log('Sender access attempts:');
                    console.log('- senderAddress property:', sampleMsg.senderAddress);
                    console.log('- sender property:', sampleMsg.sender);
                    console.log('- from property:', sampleMsg.from);
                    
                    // Check for private properties
                    const protoKeys = Object.getOwnPropertyNames(Object.getPrototypeOf(sampleMsg));
                    console.log('Prototype methods:', protoKeys);
                  } catch (e) {
                    console.log('Error inspecting message:', e);
                  }
                }
              } catch (e) {
                console.log('Error stringifying message:', e);
                // Log the message in a safer way
                console.log('Message keys:', Object.keys(messages[0]));
              }
            }
            
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
                  return content.includes(questionRequest.uuid);
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
            const responseMessages = relevantMessages.filter((msg: XmtpMessage) => {
              try {
                const content = typeof msg.content === 'string' 
                  ? msg.content 
                  : JSON.stringify(msg.content, bigIntReplacer);
                
                // Check if this is a response (contains "correct" field)
                return content.includes('correct') && content.includes('explanation');
              } catch (e) {
                return false;
              }
            });
            
            console.log('Response messages found:', responseMessages.length);
            
            if (responseMessages.length > 0) {
              // Get the most recent response
              const latestResponse = responseMessages[0];
              const responseContent = typeof latestResponse.content === 'string' 
                ? latestResponse.content 
                : JSON.stringify(latestResponse.content, bigIntReplacer);
              
              console.log('Latest response content:', responseContent);
              
              // Try to parse the message as JSON
              try {
                const responseJson = JSON.parse(responseContent);
                console.log('Parsed JSON response:', responseJson);
                
                // Check if this is a valid response for our question
                if (responseJson.uuid === questionRequest.uuid) {
                  // If the response has a "correct" field, use it to determine if the answer is correct
                  const isCorrect = responseJson.correct !== undefined 
                    ? responseJson.correct 
                    : responseJson.answer === questionRequest.selectedAnswer;
                  
                  resolve({
                    uuid: responseJson.uuid,
                    answer: responseJson.answer || questionRequest.selectedAnswer,
                    explanation: responseJson.explanation || 'No explanation provided',
                    audio_cid: responseJson.audio_cid,
                    isCorrect
                  });
                  return;
                }
              } catch (e) {
                console.log('Bot response is not valid JSON:', responseContent);
              }
            }
            
            console.log('No valid response found');
            resolve(null);
          } catch (error) {
            console.error('Error getting messages:', error);
            resolve(null);
          }
        }, 3000); // Wait 3 seconds for a response
      });
    } catch (error) {
      console.error('Error sending message to bot:', error);
      return null;
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
    const isIpfsCid = src.startsWith('Qm') || src.startsWith('bafy') || src.startsWith('bafk');
    let audioSrc = src;
    
    if (isIpfsCid) {
      // Use the premium AIOZ gateway for IPFS content
      audioSrc = `https://premium.aiozpin.network/ipfs/${src}`;
      console.log('Using IPFS gateway for audio:', audioSrc);
    }
    
    console.log('Playing audio from:', audioSrc);
    
    // Set up event handlers
    audioRef.current.oncanplaythrough = () => {
      setIsAudioLoading(false);
      setIsAudioPlaying(true);
      audioRef.current?.play().catch(err => {
        console.error('Failed to play audio:', err);
        setIsAudioPlaying(false);
        setIsAudioFinished(true);
        setIsAudioLoading(false);
      });
    };
    
    audioRef.current.onended = () => {
      setIsAudioPlaying(false);
      setIsAudioFinished(true);
      setAudioHasPlayed(true);
    };
    
    audioRef.current.onerror = (e) => {
      console.error('Audio playback error:', e);
      console.error('Audio error details:', audioRef.current?.error);
      
      // Try an alternative gateway if the first one fails
      if (isIpfsCid && audioRef.current?.src.includes('premium.aiozpin.network')) {
        console.log('Trying alternative IPFS gateway...');
        audioRef.current.src = `https://ipfs.io/ipfs/${src}`;
        audioRef.current.load();
        return;
      }
      
      setIsAudioPlaying(false);
      setIsAudioFinished(true);
      setIsAudioLoading(false);
    };
    
    // Set the source and load the audio
    audioRef.current.src = audioSrc;
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
      
      setIsAudioLoading(true);
      audioRef.current.play().catch(err => {
        console.error('Failed to play audio:', err);
        setIsAudioLoading(false);
      }).then(() => {
        setIsAudioLoading(false);
      });
      setIsAudioPlaying(true);
    }
  };
  
  // Add function to toggle study language
  const toggleStudyLanguage = () => {
    const newLanguage = studyLanguage === 'en' ? 'zh' : 'en';
    setStudyLanguage(newLanguage);
  };
  
  const loading = songLoading || questionsLoading;
  const error = songError || questionsError;
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" color="primary" />
      </div>
    );
  }
  
  if (error || !song) {
    return (
      <div className="bg-neutral-800 text-red-400 p-6 rounded-lg text-center border border-red-900/30">
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
        <p>{error?.message || t('questions.notFound')}</p>
      </div>
    );
  }
  
  if (!currentQuestion) {
    return (
      <div className="bg-neutral-800 text-yellow-400 p-6 rounded-lg text-center border border-yellow-900/30">
        <h2 className="text-xl font-bold mb-2">{t('questions.noQuestions')}</h2>
        <p>{t('questions.noQuestionsExplanation')}</p>
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col relative px-4 py-6 pb-24">
      {/* Use PageHeader component */}
      <PageHeader
        leftIcon={<X size={24} />}
        leftLink={`/song/${title}`}
        progressPercent={((currentIndex + 1) / totalQuestions) * 100}
      />

      {/* Language Selector */}
      <div className="mb-4 flex justify-end">
        <button 
          onClick={toggleStudyLanguage}
          className="flex items-center gap-1 text-sm bg-neutral-800 hover:bg-neutral-700 px-3 py-1.5 rounded-md"
        >
          <GlobeSimple size={18} weight="bold" className="text-indigo-400" />
          <span>{studyLanguage === 'en' ? '中文题目' : 'English Questions'}</span>
        </button>
      </div>
      
      {/* XMTP Connection Status */}
      {!isXmtpReady && (
        <div className="bg-blue-900/20 text-blue-400 p-3 rounded-lg mb-4 flex items-center justify-center gap-2">
          <Spinner size="sm" color="primary" />
          <span>Connecting to messaging service...</span>
        </div>
      )}

      <div className="flex-1 flex flex-col">
        {/* Main content area with fixed heights to prevent layout shifts */}
        <div className="grid gap-4">
          {/* Top section with avatar, question and feedback */}
          <div className="grid md:grid-cols-[auto_1fr] gap-4">
            {/* Avatar - centered on mobile, left on desktop */}
            <div className="flex justify-center md:block md:pr-4">
              <div className="w-24 h-24 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                <img 
                  src="/images/scarlett-peace.png" 
                  alt="Scarlett" 
                  className="w-20 h-20 object-cover"
                  onError={(e) => {
                    // Fallback to User icon if image fails to load
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.parentElement?.classList.add('flex', 'items-center', 'justify-center');
                    const icon = document.createElement('div');
                    icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="currentColor" viewBox="0 0 256 256"><path d="M230.92,212c-15.23-26.33-38.7-45.21-66.09-54.16a72,72,0,1,0-73.66,0C63.78,166.78,40.31,185.66,25.08,212a8,8,0,1,0,13.85,8c18.84-32.56,52.14-52,89.07-52s70.23,19.44,89.07,52a8,8,0,1,0,13.85-8ZM72,96a56,56,0,1,1,56,56A56.06,56.06,0,0,1,72,96Z"></path></svg>';
                    e.currentTarget.parentElement?.appendChild(icon);
                  }}
                />
            </div>
          </div>
          
            {/* Messages Container */}
            <div className="flex flex-col gap-4">
              {/* Question Message */}
              <div className="p-4 rounded-lg bg-neutral-800 border border-neutral-700">
                <p className="text-white">{currentQuestion.question}</p>
              </div>
              
              {/* Feedback Message Container - Fixed height container */}
              <div className="min-h-[100px] relative">
                {/* Actual feedback content */}
                {feedback && (
                  <div className={`p-4 rounded-lg ${
                    isValidating 
                      ? 'bg-blue-900/20 text-blue-400 border border-blue-800/30'
                      : feedback.isCorrect 
                        ? 'bg-green-900/20 text-green-400 border border-green-800/30' 
                        : 'bg-red-900/20 text-red-400 border border-red-800/30'
                  }`}>
                    {/* Explanation text with padding to avoid button overlap */}
                    <div className="pr-12">
                      {!isValidating && (
                <p className="font-medium mb-1">
                  {feedback.isCorrect ? t('questions.correct') : t('questions.incorrect')}
                </p>
                      )}
                      <p>{feedback.explanation}</p>
                    </div>
                    
                    {/* Audio button positioned at bottom right */}
                    {(feedback.audioCid || feedback.isCorrect) && !isValidating && (
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={handleToggleAudio}
                          disabled={isAudioLoading}
                          className="p-1 rounded-full bg-neutral-700 hover:bg-neutral-600 transition-colors w-8 h-8 flex items-center justify-center"
                          aria-label={isAudioPlaying ? "Pause audio" : "Play audio"}
                        >
                          {isAudioLoading ? (
                            <Spinner size="sm" color="white" className="h-4 w-4" />
                          ) : isAudioPlaying ? (
                            <Pause size={16} weight="fill" className="text-white" />
                          ) : (
                            <Play size={16} weight="fill" className="text-white" />
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
        </div>
        
          {/* Answer Options */}
          <div className="space-y-3 mt-4">
            {(['a', 'b', 'c', 'd'] as const).map((option) => (
              <button
                key={option}
                className={`w-full p-3 rounded-lg border text-left flex items-center ${
                  selectedAnswer === option
                    ? feedback?.isCorrect
                      ? 'bg-green-900/20 border-green-700 text-green-400'
                      : 'bg-red-900/20 border-red-700 text-red-400'
                    : 'border-neutral-700 hover:border-indigo-700 hover:bg-indigo-900/20'
                }`}
                onClick={() => handleAnswerSelect(option)}
                disabled={!!selectedAnswer || isValidating || !isXmtpReady}
              >
                <span className="inline-block w-6 h-6 rounded-full bg-neutral-700 text-center mr-3">
                  {option.toUpperCase()}
                </span>
                <span>{currentQuestion.options[option]}</span>
                {isValidating && selectedAnswer === option && (
                  <Spinner size="sm" color="primary" className="ml-2" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Next button - fixed at bottom */}
      {feedback && !isValidating && (
        <div className="fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-neutral-800 p-4">
          <div className="container mx-auto px-4">
      <button
              className="w-full py-3 rounded-lg flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => goToNextQuestion()}
            >
              {currentIndex >= totalQuestions - 1 ? (
                <div className="flex items-center justify-center gap-2">
                  {t('questions.complete')} <ArrowRight size={16} weight="bold" />
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  {t('questions.nextQuestion')} <ArrowRight size={16} weight="bold" />
                </div>
              )}
      </button>
          </div>
        </div>
      )}
      
      {/* Hidden audio element for playing sounds */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};

export default StudyPage; 