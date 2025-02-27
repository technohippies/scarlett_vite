import { useState, useEffect } from 'react';
import { Question, QuestionWithResponse } from '../types/song';
import { fetchQuestionsByCid } from '../lib/ipfs/content';

export function useQuestions(questionsCid: string | undefined, language: 'en' | 'zh') {
  const [questions, setQuestions] = useState<QuestionWithResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);

  useEffect(() => {
    if (!questionsCid) {
      setLoading(false);
      return;
    }

    const fetchQuestions = async () => {
      try {
        setLoading(true);
        const data = await fetchQuestionsByCid(questionsCid);
        const questionsWithResponses = data.map((q: Question) => ({
          ...q,
          userAnswer: undefined,
          isCorrect: undefined,
          response: undefined,
        }));
        setQuestions(questionsWithResponses);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch questions'));
      } finally {
        setLoading(false);
      }
    };

    fetchQuestions();
  }, [questionsCid]);

  const currentQuestion = questions[currentIndex] || null;

  const goToNextQuestion = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return true;
    }
    return false;
  };

  const goToPreviousQuestion = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      return true;
    }
    return false;
  };

  const setQuestionAnswer = (
    uuid: string,
    answer: 'a' | 'b' | 'c' | 'd',
    isCorrect: boolean,
    response?: any
  ) => {
    setQuestions((prevQuestions) =>
      prevQuestions.map((q) =>
        q.uuid === uuid
          ? {
              ...q,
              userAnswer: answer,
              isCorrect,
              response,
            }
          : q
      )
    );
  };

  const resetQuestions = () => {
    setQuestions((prevQuestions) =>
      prevQuestions.map((q) => ({
        ...q,
        userAnswer: undefined,
        isCorrect: undefined,
        response: undefined,
      }))
    );
    setCurrentIndex(0);
  };

  return {
    questions,
    currentQuestion,
    currentIndex,
    loading,
    error,
    goToNextQuestion,
    goToPreviousQuestion,
    setQuestionAnswer,
    resetQuestions,
    totalQuestions: questions.length,
    isLastQuestion: currentIndex === questions.length - 1,
    isFirstQuestion: currentIndex === 0,
  };
} 