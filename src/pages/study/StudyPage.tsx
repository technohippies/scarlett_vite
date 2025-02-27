import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { useQuestions } from '../../hooks/useQuestions';
import { Play, SpeakerHigh, ArrowRight, User, X } from '@phosphor-icons/react';
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
  
  // Reset selected answer when question changes
  useEffect(() => {
    setSelectedAnswer(null);
    setFeedback(null);
  }, [currentIndex]);
  
  const handleAnswerSelect = (answer: 'a' | 'b' | 'c' | 'd') => {
    if (selectedAnswer || feedback) return; // Prevent changing answer after submission
    
    setSelectedAnswer(answer);
    
    // Mock - in real app, this would come from XMTP response
    const isCorrect = answer === 'a'; // Always assume 'a' is correct for demo
    
    // Create mock feedback (in real app, this would come from bot response)
    setTimeout(() => {
      setFeedback({
        isCorrect,
        explanation: isCorrect 
          ? 'Great job! That is the correct answer.' 
          : `Incorrect. The correct answer is A: ${currentQuestion?.options.a}`,
        audioCid: 'bafkreidc4eh2bhi7vzztxmmva6chvrya5l65vvf45bolk3v4wew6u5tw6m'
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
            audio_cid: 'bafkreidc4eh2bhi7vzztxmmva6chvrya5l65vvf45bolk3v4wew6u5tw6m'
          }
        );
      }
    }, 1000);
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
    <div className="flex-1 flex flex-col relative px-4 py-6">
      {/* Use PageHeader component instead of custom header */}
      <PageHeader
        leftIcon={<X size={24} />}
        leftLink={`/song/${title}`}
        progressPercent={((currentIndex + 1) / totalQuestions) * 100}
      />

      <div className="flex-1 flex flex-col">
        <div className="flex flex-col h-full">
          {/* Question and answer container */}
          <div className="bg-neutral-800 rounded-lg border border-neutral-700 mb-6 overflow-hidden">
            {/* Question section - displayed as a chat message */}
            <div className="p-4 border-b border-neutral-700">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
                  <User size={20} weight="fill" />
                </div>
                <div>
                  <p className="font-medium mb-2 text-white">{currentQuestion.question}</p>
                  <button className="text-indigo-400 text-sm flex items-center">
                    <SpeakerHigh size={16} className="mr-1" />
                    {t('questions.listenAudio')}
                  </button>
                </div>
              </div>
              
              {/* Feedback when answer is submitted - displayed as a chat message */}
              {feedback && (
                <div className={`mt-4 p-3 rounded-lg flex gap-3 ${
                  feedback.isCorrect ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'
                }`}>
                  <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center">
                    <Play size={20} weight="fill" />
                  </div>
                  <div>
                    <p className="font-medium mb-1">
                      {feedback.isCorrect ? t('questions.correct') : t('questions.incorrect')}
                    </p>
                    <p className="text-sm">{feedback.explanation}</p>
                  </div>
                </div>
              )}
            </div>
            
            {/* Options section */}
            <div className="p-4">
              <div className="space-y-3">
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
          
          {/* Next button */}
          {feedback && (
            <button
              className="mt-auto w-full py-3 rounded-lg flex items-center justify-center gap-2 bg-indigo-600 text-white"
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
          )}
        </div>
      </div>
    </div>
  );
};

export default StudyPage; 