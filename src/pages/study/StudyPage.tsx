import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { useQuestions } from '../../hooks/useQuestions';
import { Play, Pause, ArrowRight, User, X } from '@phosphor-icons/react';
import PageHeader from '../../components/layout/PageHeader';

const StudyPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language as 'en' | 'zh';
  const { song, loading: songLoading, error: songError } = useSongByTitle(title || null);
  
  // Get the appropriate questions CID based on language
  const questionsCid = song ? (currentLanguage === 'en' ? song.questions_cid_1 : song.questions_cid_2) : undefined;
  
  const { 
    questions, 
    currentQuestion, 
    loading: questionsLoading, 
    error: questionsError,
    goToNextQuestion,
    setQuestionAnswer,
    currentIndex,
    totalQuestions
  } = useQuestions(questionsCid, currentLanguage);
  
  const [selectedAnswer, setSelectedAnswer] = useState<'a' | 'b' | 'c' | 'd' | null>(null);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    explanation: string;
    audioCid?: string;
  } | null>(null);
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);
  const [isAudioLoading, setIsAudioLoading] = useState(false);
  const [isAudioFinished, setIsAudioFinished] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Reset selected answer when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setFeedback(null);
    setIsAudioPlaying(false);
    setIsAudioLoading(false);
    setIsAudioFinished(false);
    
    // Stop any playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, [currentIndex]);
  
  const handleAnswerSelect = (answer: 'a' | 'b' | 'c' | 'd') => {
    if (selectedAnswer || feedback) return; // Prevent changing answer after submission
    
    setSelectedAnswer(answer);
    
    // Mock - in real app, this would come from XMTP response
    const isCorrect = answer === 'a'; // Always assume 'a' is correct for demo
    
    // Create mock feedback (in real app, this would come from bot response)
    setTimeout(() => {
      // Select a random audio file from the feedback folder
      const feedbackAudios = [
        'fantastic-tai-bang-le.mp3',
        'gan-de-piaoliang-well-done.mp3',
        'hen-chuse-excellent.mp3',
        'very-good-hen-hao.mp3'
      ];
      
      const randomAudio = isCorrect 
        ? `/audio/feedback/${feedbackAudios[Math.floor(Math.random() * feedbackAudios.length)]}` 
        : null;
      
      setFeedback({
        isCorrect,
        explanation: isCorrect 
          ? 'Great job! That is the correct answer.' 
          : `Incorrect. The correct answer is A: ${currentQuestion?.options.a}`,
        audioCid: randomAudio || undefined
      });
      
      // Update question state
      if (currentQuestion) {
        setQuestionAnswer(
          currentQuestion.uuid, 
          answer, 
          isCorrect, 
          {
            uuid: currentQuestion.uuid,
            answer: 'a', // Mock correct answer
            explanation: isCorrect ? 'Correct!' : 'Incorrect',
            audio_cid: randomAudio || undefined
          }
        );
      }
      
      // Play audio if available
      if (randomAudio && isCorrect) {
        playAudio(randomAudio);
      }
    }, 1000);
  };
  
  const playAudio = (src: string) => {
    setIsAudioLoading(true);
    
    if (!audioRef.current) {
      audioRef.current = new Audio(src);
    } else {
      audioRef.current.src = src;
    }
    
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
    };
    
    audioRef.current.onerror = () => {
      console.error('Audio playback error');
      setIsAudioPlaying(false);
      setIsAudioFinished(true);
      setIsAudioLoading(false);
    };
    
    audioRef.current.load();
  };
  
  const handleToggleAudio = () => {
    if (!audioRef.current || !feedback?.audioCid) return;
    
    if (isAudioPlaying) {
      audioRef.current.pause();
      setIsAudioPlaying(false);
    } else {
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
  
  const loading = songLoading || questionsLoading;
  const error = songError || questionsError;
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400"></div>
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
                    feedback.isCorrect ? 'bg-green-900/20 text-green-400 border border-green-800/30' : 'bg-red-900/20 text-red-400 border border-red-800/30'
                  }`}>
                    {/* Explanation text with padding to avoid button overlap */}
                    <div className="pr-12">
                      <p className="font-medium mb-1">
                        {feedback.isCorrect ? t('questions.correct') : t('questions.incorrect')}
                      </p>
                      <p>{feedback.explanation}</p>
                    </div>
                    
                    {/* Audio button positioned at bottom right */}
                    {feedback.audioCid && (
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={handleToggleAudio}
                          disabled={isAudioLoading}
                          className="p-1 rounded-full bg-neutral-700 hover:bg-neutral-600 transition-colors w-8 h-8 flex items-center justify-center"
                          aria-label={isAudioPlaying ? "Pause audio" : "Play audio"}
                        >
                          {isAudioLoading ? (
                            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
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
                disabled={!!selectedAnswer}
              >
                <span className="inline-block w-6 h-6 rounded-full bg-neutral-700 text-center mr-3">
                  {option.toUpperCase()}
                </span>
                <span>{currentQuestion.options[option]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
      
      {/* Next button - fixed at bottom */}
      {feedback && (
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