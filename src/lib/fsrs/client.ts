// Remove the global window.ethereum declaration since it conflicts with another declaration
// and import the necessary types from ts-fsrs
import { Card, createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';

// Define interfaces for our FSRS integration
export interface FSRSQuestion {
  uuid: string;
  correct?: boolean;
  fsrs?: Card;
  [key: string]: any; // Allow for additional properties from the original question
}

export interface FSRSUserProgress {
  userId: string;
  songId: string;
  questions: FSRSQuestion[];
  completedAt: string;
}

// Interface for Irys progress data
export interface UserProgress {
  userId: string;
  songId: string;
  questions: Array<{
    uuid: string;
    selectedAnswer: string;
    isCorrect: boolean;
    timestamp: number;
    fsrs?: Card;
  }>;
  completedAt: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
}

class FSRSService {
  // We'll use a private method to get the FSRS instance when needed
  // This avoids the unused variable warning
  private getFsrsInstance() {
    // Initialize FSRS with custom parameters
    const params = generatorParameters({
      maximum_interval: 365, // Maximum interval of 1 year
      enable_fuzz: true,     // Enable fuzzy scheduling
      request_retention: 0.9, // Target retention rate of 90%
      w: [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61], // Default weights
    });
    
    return fsrs(params);
  }
  
  constructor() {
    console.log('[FSRSService] Initialized with custom parameters');
  }

  // Convert a boolean correct/incorrect to an FSRS rating
  public rateAnswer(isCorrect: boolean): Rating {
    return isCorrect ? Rating.Good : Rating.Again;
  }
  
  // Update a card based on the user's answer
  public updateCard(card: Card | undefined, rating: Rating): Card {
    const now = new Date();
    
    try {
      // If no existing card, create a new one
      const currentCard: Card = card || createEmptyCard(now);
      
      // Get a fresh FSRS instance and use it
      const fsrsInstance = this.getFsrsInstance();
      
      // Use ts-fsrs to get the scheduling cards
      const schedulingCards = fsrsInstance.repeat(currentCard, now);
      
      // Access the card based on the rating using a type-safe approach
      // This handles different versions of ts-fsrs
      let newCard: Card;
      
      // Cast to any to avoid TypeScript errors with property access
      const result = schedulingCards as any;
      
      // Access the appropriate property based on the rating
      switch (rating) {
        case Rating.Again:
          newCard = result.again?.card;
          break;
        case Rating.Hard:
          newCard = result.hard?.card;
          break;
        case Rating.Good:
          newCard = result.good?.card;
          break;
        case Rating.Easy:
          newCard = result.easy?.card;
          break;
        default:
          // Default to Good if rating is not recognized
          newCard = result.good?.card;
      }
      
      // If we couldn't get a card from the result, use the current card
      if (!newCard) {
        console.warn('[FSRSService] Could not get card from result, using current card');
        newCard = currentCard;
      }
      
      return newCard;
    } catch (error) {
      console.error('[FSRSService] Error updating card:', error);
      
      // Fallback to a simple implementation if the FSRS API fails
      const fallbackCard: Card = card || createEmptyCard(now);
      return {
        ...fallbackCard,
        due: new Date(now.getTime() + (isCorrect(rating) ? 86400000 : 21600000)), // 1 day or 6 hours
        last_review: now
      };
    }
    
    // Helper function to check if a rating is considered "correct"
    function isCorrect(r: Rating): boolean {
      return r === Rating.Good || r === Rating.Easy;
    }
  }
  
  // Select questions for study based on FSRS algorithm
  public async selectQuestions(allQuestions: any[], maxQuestions: number = 20) {
    console.log(`[FSRSService] Selecting up to ${maxQuestions} questions from ${allQuestions.length} total questions`);
    
    // Get the user's previous progress
    const userId = this.getUserId();
    const songId = this.getSongId();
    
    if (!userId || !songId) {
      console.log('[FSRSService] No user ID or song ID available, returning random questions');
      return this.getRandomQuestions(allQuestions, maxQuestions);
    }
    
    const previousProgress = await this.getLatestProgress(userId, songId);
    
    if (!previousProgress || !previousProgress.questions.length) {
      console.log('[FSRSService] No previous progress found, returning new questions');
      return this.getRandomQuestions(allQuestions, maxQuestions);
    }
    
    const now = new Date();
    const dueQuestions: any[] = [];
    const newQuestions: any[] = [];
    const reviewedButNotDueQuestions: any[] = [];
    const previouslyAnsweredUuids = new Set<string>();
    
    // Process previous progress to find due cards
    previousProgress.questions.forEach(progressItem => {
      previouslyAnsweredUuids.add(progressItem.uuid);
      
      // Find the original question data
      const originalQuestion = allQuestions.find(q => q.uuid === progressItem.uuid);
      if (originalQuestion) {
        // If the question has FSRS data
        if (progressItem.fsrs) {
          const dueDate = new Date(progressItem.fsrs.due);
          
          // Check if the question is due for review
          if (dueDate <= now) {
            dueQuestions.push({
              ...originalQuestion,
              fsrs: progressItem.fsrs,
              dueDate: dueDate, // Add due date for sorting
              priority: 1 // Highest priority
            });
          } else {
            // Question has been reviewed but is not due yet
            reviewedButNotDueQuestions.push({
              ...originalQuestion,
              fsrs: progressItem.fsrs,
              dueDate: dueDate,
              priority: 3 // Lowest priority for reviewed questions
            });
          }
        } else {
          // Question was answered but doesn't have FSRS data
          // This is unusual but could happen if there was an error
          reviewedButNotDueQuestions.push({
            ...originalQuestion,
            priority: 2 // Medium priority
          });
        }
      }
    });
    
    // Find questions that haven't been answered before
    allQuestions.forEach(question => {
      if (!previouslyAnsweredUuids.has(question.uuid)) {
        newQuestions.push({
          ...question,
          priority: 2 // Medium priority for new questions
        });
      }
    });
    
    console.log(`[FSRSService] Found ${dueQuestions.length} due questions, ${newQuestions.length} new questions, and ${reviewedButNotDueQuestions.length} reviewed but not due questions`);
    
    // Sort due questions by due date (oldest first)
    dueQuestions.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
    
    // Shuffle new questions to get a random selection
    const shuffledNewQuestions = this.shuffleArray([...newQuestions]);
    
    // Prioritize due questions, then new questions, then reviewed but not due
    let selectedQuestions = [...dueQuestions];
    
    // If we need more questions, add new ones
    if (selectedQuestions.length < maxQuestions) {
      const neededNewQuestions = maxQuestions - selectedQuestions.length;
      selectedQuestions = [
        ...selectedQuestions,
        ...shuffledNewQuestions.slice(0, neededNewQuestions)
      ];
    }
    
    // If we still need more questions, add reviewed but not due questions
    if (selectedQuestions.length < maxQuestions) {
      const neededMoreQuestions = maxQuestions - selectedQuestions.length;
      // Sort by due date (soonest first)
      reviewedButNotDueQuestions.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
      selectedQuestions = [
        ...selectedQuestions,
        ...reviewedButNotDueQuestions.slice(0, neededMoreQuestions)
      ];
    }
    
    // Remove any FSRS-specific properties that shouldn't be exposed to the UI
    const cleanedQuestions = selectedQuestions.map(q => {
      const { priority, dueDate, ...cleanQuestion } = q;
      return cleanQuestion;
    });
    
    console.log(`[FSRSService] Selected ${cleanedQuestions.length} questions for study`);
    return cleanedQuestions;
  }
  
  // Helper method to get random questions when no progress exists
  private getRandomQuestions(questions: any[], maxQuestions: number): any[] {
    const shuffled = this.shuffleArray([...questions]);
    return shuffled.slice(0, maxQuestions);
  }
  
  // Helper method to shuffle an array
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  // Helper methods to get user and song IDs
  private getUserId(): string | null {
    // This would typically come from a wallet connection or auth system
    // For now, we'll check if window.ethereum is available
    if (typeof window !== 'undefined' && window.ethereum) {
      // Use a safer approach to access selectedAddress
      const ethereum = window.ethereum as any;
      const address = ethereum.selectedAddress;
      // Ensure we return a string or null, not an empty object
      return typeof address === 'string' ? address : null;
    }
    return null;
  }
  
  private getSongId(): string | null {
    // This would typically come from the current route or app state
    // For now, we'll return null and let the caller provide the song ID
    return null;
  }
  
  // Fetch the latest progress from Irys
  public async getLatestProgress(userId: string, songId: string): Promise<FSRSUserProgress | null> {
    console.log(`[FSRSService] Getting latest progress for userId=${userId}, songId=${songId}`);
    
    try {
      // Use the IrysService to fetch the raw progress data
      const irysProgress = await this.fetchProgressFromIrys(userId, songId);
      
      if (!irysProgress) {
        console.log('[FSRSService] No progress found in Irys');
        return null;
      }
      
      // Convert to FSRSUserProgress format
      const fsrsProgress: FSRSUserProgress = {
        userId: irysProgress.userId,
        songId: irysProgress.songId,
        questions: irysProgress.questions.map(q => ({
          uuid: q.uuid,
          correct: q.isCorrect,
          fsrs: q.fsrs && {
            ...q.fsrs,
            due: new Date(q.fsrs.due),
            last_review: q.fsrs.last_review ? new Date(q.fsrs.last_review) : undefined
          }
        })),
        completedAt: String(irysProgress.completedAt)
      };
      
      console.log(`[FSRSService] Converted progress contains ${fsrsProgress.questions.length} questions`);
      return fsrsProgress;
    } catch (error) {
      console.error('[FSRSService] Error getting latest progress:', error);
      return null;
    }
  }
  
  // Fetch progress data from Irys
  private async fetchProgressFromIrys(userId: string, songId: string): Promise<UserProgress | null> {
    console.log(`[FSRSService] Fetching progress from Irys for userId=${userId}, songId=${songId}`);
    
    try {
      // Use the API route with query parameters
      const url = `/api/irys/progress?userId=${userId}&songId=${songId}`;
      console.log(`[FSRSService] Fetching from API: ${url}`);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`[FSRSService] API request failed: ${response.statusText}`);
        throw new Error(`Failed to fetch progress: ${response.statusText}`);
      }
      
      const apiResponse = await response.json();
      console.log(`[FSRSService] API response received:`, apiResponse ? 'Data found' : 'No data found');
      
      if (!apiResponse || !apiResponse.success || !apiResponse.data) {
        console.log('[FSRSService] No valid data in API response');
        return null;
      }

      // Return the data property which contains the actual UserProgress
      return apiResponse.data as UserProgress;
    } catch (error) {
      console.error('[FSRSService] Error fetching progress from Irys:', error);
      return null;
    }
  }
  
  // Save progress to Irys
  public async saveProgress(progress: UserProgress): Promise<string | null> {
    console.log(`[FSRSService] Saving progress to Irys for userId=${progress.userId}, songId=${progress.songId}`);
    
    try {
      const response = await fetch('/api/irys/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(progress),
      });
      
      if (!response.ok) {
        console.error(`[FSRSService] Failed to save progress: ${response.statusText}`);
        throw new Error(`Failed to save progress: ${response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`[FSRSService] Progress saved successfully with ID: ${result.id}`);
      return result.id;
    } catch (error) {
      console.error('[FSRSService] Error saving progress:', error);
      return null;
    }
  }
}

// Export a singleton instance
export const fsrsService = new FSRSService();
export default fsrsService; 