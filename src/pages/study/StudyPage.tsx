import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { useQuestions } from '../../hooks/useQuestions';
import { Play, Pause, ArrowRight, X, GlobeSimple, CaretLeft } from '@phosphor-icons/react';
import PageHeader from '../../components/layout/PageHeader';
import { useXmtp } from '../../context/XmtpContext';
import Spinner from '../../components/ui/Spinner';
import { SCARLETT_BOT_ADDRESS } from '../../lib/constants';

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
  const [xmtpConnectionAttempted, setXmtpConnectionAttempted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Check if XMTP is connected - FIXED: added connection attempt tracking
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
      // FIXED: Only attempt to connect once to prevent repeated signature requests
      if (!xmtpConnectionAttempted && xmtp) {
        setXmtpConnectionAttempted(true);
        setFeedback({
          isCorrect: false,
          explanation: 'Connecting to XMTP...'
        });
        
        try {
          // Try to get the wallet client from the context
          if (xmtp.connectWithWagmi) {
            await xmtp.connectWithWagmi();
            setIsXmtpReady(true);
            setFeedback(null);
            return; // Exit and let the user try again
          }
        } catch (error) {
          console.error('Failed to connect to XMTP:', error);
          setFeedback({
            isCorrect: false,
            explanation: 'Failed to connect to XMTP. Please refresh the page and try again.'
          });
          return;
        }
      } else {
        setFeedback({
          isCorrect: false,
          explanation: 'XMTP connection is not ready. Please refresh the page and try again.'
        });
        return;
      }
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
      const conversation = await xmtp.createBotConversation();
      
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
              try {
                // Use the global bigIntReplacer function defined at the top of the file
                console.log('Sample message structure:', JSON.stringify(messages[0], bigIntReplacer));
                
                // Try to access properties using different methods
                const sampleMsg = messages[0];
                console.log('Direct properties:', Object.keys(sampleMsg));
              } catch (e) {
                console.log('Error stringifying message:', e);
                // Log the message keys in a safer way
                if (messages[0]) {
                  console.log('Message keys:', Object.keys(messages[0]));
                }
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
                
                // Check if this is a response (contains "correct" field or "explanation")
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
                console.log('Bot response is not valid JSON, using as plain text:', responseContent);
                
                // If it's not JSON, try to extract information from the text
                // This is a fallback for plain text responses
                const isCorrect = responseContent.toLowerCase().includes('correct');
                
                resolve({
                  uuid: questionRequest.uuid,
                  answer: questionRequest.selectedAnswer,
                  explanation: responseContent || 'No explanation provided',
                  isCorrect
                });
                return;
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
    const audioSrc = src.startsWith('/') 
      ? src // Local file path
      : `/ipfs/${src}`; // IPFS CID
    
    audioRef.current.src = audioSrc;
    
    // Set up event listeners
    audioRef.current.onloadeddata = () => {
      setIsAudioLoading(false);
      setIsAudioPlaying(true);
      audioRef.current?.play().catch(error => {
        console.error('Error playing audio:', error);
        setIsAudioPlaying(false);
        setIsAudioLoading(false);
      });
    };
    
    audioRef.current.onended = () => {
      setIsAudioPlaying(false);
      setIsAudioFinished(true);
      setAudioHasPlayed(true);
    };
    
    audioRef.current.onerror = (e) => {
      console.error('Audio error:', e);
      setIsAudioLoading(false);
      setIsAudioPlaying(false);
    };
    
    // Load the audio
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
    // Toggle between English and Chinese
    const newLanguage = studyLanguage === 'en' ? 'zh' : 'en';
    setStudyLanguage(newLanguage);
  };
  
  const loading = songLoading || questionsLoading;
  const error = songError || questionsError;
  
  if (loading) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink={`/song/${title}`}
          title={t('study.title')}
        />
        <div className="flex flex-col items-center justify-center py-12">
          <Spinner size="lg" color="primary" />
          <p className="mt-4 text-neutral-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }
  
  if (error || !song || !currentQuestion) {
    return (
      <div className="container mx-auto px-4 py-6">
        <PageHeader
          leftIcon={<CaretLeft size={24} />}
          leftLink={`/song/${title}`}
          title={t('study.title')}
        />
        <div className="bg-red-900/20 text-red-400 p-6 rounded-lg text-center">
          <X size={48} weight="bold" className="mx-auto mb-2" />
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
          <p>{songError?.message || questionsError?.message || t('study.noQuestions')}</p>
          <Link to={`/song/${title}`} className="mt-4 inline-block text-indigo-400">
            {t('common.goBack')}
          </Link>
      </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page header with back button */}
      <PageHeader
        leftIcon={<CaretLeft size={24} />}
        leftLink={`/song/${title}`}
        title={t('study.title')}
      />
      
      {/* XMTP Connection Status */}
      {!isXmtpReady && (
        <div className="mb-4 bg-yellow-900/20 text-yellow-400 p-3 rounded-lg flex items-center">
          <Spinner size="sm" color="primary" className="mr-2" />
          <span>{t('study.xmtpConnecting')}</span>
        </div>
      )}
      
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
      
      {/* Question card */}
      <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-5 mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">{t('study.question')} {currentIndex + 1}/{totalQuestions}</h3>
          <span className="text-sm text-neutral-400">{studyLanguage === 'en' ? 'English' : '中文'}</span>
            </div>
        
        <p className="text-lg mb-6">{currentQuestion.question}</p>
        
        <div className="space-y-3">
          {['a', 'b', 'c', 'd'].map((option) => (
            <button
              key={option}
              onClick={() => handleAnswerSelect(option as 'a' | 'b' | 'c' | 'd')}
              disabled={!!selectedAnswer || isValidating || !isXmtpReady}
              className={`w-full text-left p-3 rounded-lg flex items-start transition-colors ${
                selectedAnswer === option
                  ? currentQuestion.userAnswer === option && currentQuestion.isCorrect
                    ? 'bg-green-900/30 border border-green-700'
                    : currentQuestion.userAnswer === option
                    ? 'bg-red-900/30 border border-red-700'
                    : 'bg-indigo-900/30 border border-indigo-700'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              } ${!!selectedAnswer || isValidating || !isXmtpReady ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <span className="inline-block w-6 h-6 rounded-full bg-neutral-600 text-center mr-3 flex-shrink-0">
                {option}
              </span>
              <span>{currentQuestion.options[option as keyof typeof currentQuestion.options]}</span>
              </button>
          ))}
            </div>
        
        {/* Feedback message */}
        {feedback && (
          <div className={`mt-6 p-4 rounded-lg ${
            isValidating 
              ? 'bg-neutral-700/50 border border-neutral-600' 
              : feedback.isCorrect
              ? 'bg-green-900/30 border border-green-700'
              : 'bg-red-900/30 border border-red-700'
          }`}>
            <p className="font-medium mb-2">
              {isValidating 
                ? t('study.checking') 
                : feedback.isCorrect 
                ? t('study.correct') 
                : t('study.incorrect')}
            </p>
            <p className="text-neutral-300">{feedback.explanation}</p>
          </div>
        )}
          </div>
          
      {/* Navigation buttons */}
      <div className="flex justify-between">
        <div>
          {/* Audio button - only show if feedback with audio is available */}
          {feedback && feedback.audioCid && (
            <button
              onClick={handleToggleAudio}
              disabled={isAudioLoading}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                isAudioPlaying
                  ? 'bg-indigo-700 text-white'
                  : 'bg-neutral-800 text-white hover:bg-neutral-700'
              } ${isAudioLoading ? 'opacity-50 cursor-wait' : ''}`}
            >
              {isAudioLoading ? (
                <Spinner size="sm" color="white" />
              ) : isAudioPlaying ? (
                <Pause size={20} weight="fill" />
              ) : (
                <Play size={20} weight="fill" />
              )}
              {isAudioLoading
                ? t('study.loadingAudio')
                : isAudioPlaying
                ? t('study.pauseAudio')
                : isAudioFinished
                ? t('study.replayAudio')
                : t('study.playAudio')}
            </button>
          )}
        </div>
        
              <button
          onClick={goToNextQuestion}
          disabled={!selectedAnswer || isValidating}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg bg-indigo-600 text-white ${
            !selectedAnswer || isValidating ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'
          }`}
        >
          {currentIndex === totalQuestions - 1 ? t('study.finish') : t('study.next')}
          <ArrowRight size={20} weight="bold" />
              </button>
      </div>
    </div>
  );
};

export default StudyPage; 