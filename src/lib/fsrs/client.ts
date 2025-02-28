import { FSRS, Card, Rating, createEmptyCard, fsrs, Grade } from 'ts-fsrs';
import { Question } from '../../types/song';

// Define the structure for user progress data with FSRS
export interface UserProgress {
  userId: string;
  songId: string;
  questions: Array<{
    uuid: string;
    correct: boolean;
    fsrs?: Card;
  }>;
  completedAt: string;
}

class FSRSService {
  private fsrs: FSRS;
  
  constructor() {
    // Initialize FSRS with default parameters
    this.fsrs = fsrs({});
  }
  
  /**
   * Select questions for a user based on their previous progress
   */
  async selectQuestions(
    allQuestions: Question[],
    previousProgress?: UserProgress | null,
    maxQuestions: number = 20
  ): Promise<Question[]> {
    if (!previousProgress || !previousProgress.questions.length) {
      // If no previous progress, return the first maxQuestions
      return allQuestions.slice(0, maxQuestions);
    }
    
    // Create a map of question UUIDs to their FSRS cards
    const cardMap = new Map<string, Card>();
    previousProgress.questions.forEach(q => {
      if (q.fsrs) {
        cardMap.set(q.uuid, q.fsrs);
      }
    });
    
    // Calculate due dates for all questions
    const now = new Date();
    const questionScores = allQuestions.map(q => {
      const card = cardMap.get(q.uuid);
      
      // If the card exists, calculate how overdue it is
      if (card) {
        const dueDate = new Date(card.due);
        const daysOverdue = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
        
        return {
          question: q,
          overdue: daysOverdue,
          hasCard: true
        };
      }
      
      // If no card exists, this question has never been seen
      return {
        question: q,
        overdue: Infinity, // Prioritize new questions
        hasCard: false
      };
    });
    
    // Sort questions by how overdue they are (most overdue first)
    questionScores.sort((a, b) => b.overdue - a.overdue);
    
    // Return the top maxQuestions
    return questionScores.slice(0, maxQuestions).map(q => q.question);
  }
  
  /**
   * Rate an answer based on correctness
   */
  rateAnswer(isCorrect: boolean): Grade {
    return isCorrect ? Rating.Good as Grade : Rating.Again as Grade;
  }
  
  /**
   * Update a card based on the user's answer
   */
  updateCard(card: Card | undefined, rating: Grade): Card {
    const now = new Date();
    
    if (!card) {
      // If this is a new card, create it
      const newCard = createEmptyCard(now);
      const result = this.fsrs.next(newCard, now, rating);
      return result.card;
    }
    
    // Otherwise, update the existing card
    const result = this.fsrs.next(card, now, rating);
    return result.card;
  }
}

// Export a singleton instance
export const fsrsService = new FSRSService();
export default fsrsService; 