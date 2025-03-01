/**
 * FSRS Debugger Utility
 * 
 * This utility provides functions to debug and log FSRS data from Irys
 * It helps visualize the spaced repetition data for questions and determine
 * which questions should be shown to users based on their learning history.
 */

import { fsrsService, FSRSUserProgress } from '../lib/fsrs/client';
import { irysService } from '../lib/irys/client';

/**
 * Ensure Irys is initialized before proceeding
 * @param userId The user's Ethereum address (needed for error messages)
 * @returns Promise that resolves when Irys is initialized
 */
const ensureIrysInitialized = async (userId: string): Promise<void> => {
  try {
    // @ts-ignore - Accessing private property for debugging
    if (!irysService.isInitialized) {
      console.log(`[FSRSDebugger] Irys not initialized. Attempting to initialize...`);
      
      // Check if we have a provider from window.ethereum
      if (typeof window !== 'undefined' && window.ethereum) {
        console.log(`[FSRSDebugger] Found window.ethereum, initializing Irys...`);
        await irysService.init(window.ethereum, true); // Use devnet
        console.log(`[FSRSDebugger] Irys initialized successfully`);
      } else {
        console.error(`[FSRSDebugger] No Ethereum provider found. Cannot initialize Irys.`);
        throw new Error(`Cannot initialize Irys: No Ethereum provider available for user ${userId}`);
      }
    } else {
      console.log(`[FSRSDebugger] Irys already initialized`);
    }
  } catch (error) {
    console.error(`[FSRSDebugger] Error ensuring Irys is initialized:`, error);
    throw new Error(`Failed to initialize Irys: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Log FSRS progress data for a specific user and song
 * @param userId The user's Ethereum address
 * @param songId The song ID
 * @returns Promise with the logged data or null if not found
 */
export const logFsrsProgress = async (
  userId: string, 
  songId: string
): Promise<{
  fsrsData: FSRSUserProgress | null,
  dueQuestions: any[],
  stats: any
} | null> => {
  console.log(`[FSRSDebugger] Logging FSRS progress for userId=${userId}, songId=${songId}`);
  
  try {
    // Ensure Irys is initialized before proceeding
    await ensureIrysInitialized(userId);
    
    // Get the latest progress from FSRS service
    const fsrsProgress = await fsrsService.getLatestProgress(userId, songId);
    
    if (!fsrsProgress) {
      console.log('[FSRSDebugger] No FSRS progress found');
      return null;
    }
    
    // Log the progress data
    console.log('[FSRSDebugger] FSRS Progress Data:', {
      userId: fsrsProgress.userId,
      songId: fsrsProgress.songId,
      completedAt: fsrsProgress.completedAt,
      questionCount: fsrsProgress.questions.length
    });
    
    // Calculate statistics
    const now = new Date();
    const dueQuestions = fsrsProgress.questions.filter(q => 
      q.fsrs && new Date(q.fsrs.due) <= now
    );
    
    const stats = {
      totalQuestions: fsrsProgress.questions.length,
      dueQuestions: dueQuestions.length,
      averageStability: calculateAverage(fsrsProgress.questions, 'stability'),
      averageDifficulty: calculateAverage(fsrsProgress.questions, 'difficulty'),
      averageReps: calculateAverage(fsrsProgress.questions, 'reps'),
      questionsByState: countByState(fsrsProgress.questions),
      nextDueDates: getNextDueDates(fsrsProgress.questions)
    };
    
    console.log('[FSRSDebugger] FSRS Statistics:', stats);
    
    // Log individual questions (limited to first 5 for brevity)
    console.log('[FSRSDebugger] Sample Questions:');
    fsrsProgress.questions.slice(0, 5).forEach((q, index) => {
      console.log(`Question ${index + 1}:`, {
        uuid: q.uuid,
        correct: q.correct,
        fsrs: q.fsrs ? {
          due: q.fsrs.due,
          state: q.fsrs.state,
          stability: q.fsrs.stability,
          difficulty: q.fsrs.difficulty,
          reps: q.fsrs.reps,
          lapses: q.fsrs.lapses,
          isDue: q.fsrs.due <= now
        } : 'No FSRS data'
      });
    });
    
    return {
      fsrsData: fsrsProgress,
      dueQuestions,
      stats
    };
  } catch (error) {
    console.error('[FSRSDebugger] Error logging FSRS progress:', error);
    return null;
  }
};

/**
 * Log all progress entries for a user
 * @param userId The user's Ethereum address
 * @returns Promise with an array of progress entries
 */
export const logAllUserProgress = async (userId: string): Promise<any[]> => {
  console.log(`[FSRSDebugger] Logging all progress for userId=${userId}`);
  
  try {
    // Ensure Irys is initialized before proceeding
    await ensureIrysInitialized(userId);
    
    // Get all progress entries from Irys
    const allProgress = await irysService.getAllUserProgress(userId);
    
    if (!allProgress || allProgress.length === 0) {
      console.log('[FSRSDebugger] No progress entries found for this user');
      return [];
    }
    
    console.log(`[FSRSDebugger] Found ${allProgress.length} progress entries`);
    
    // Sort by completion date (newest first)
    const sortedProgress = [...allProgress].sort((a, b) => 
      new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    
    // Log each progress entry
    sortedProgress.forEach((progress, index) => {
      console.log(`[FSRSDebugger] Progress #${index + 1}:`, {
        songId: progress.songId,
        completedAt: new Date(progress.completedAt).toLocaleString(),
        questionCount: progress.questions.length,
        correctAnswers: progress.correctAnswers,
        accuracy: progress.accuracy
      });
    });
    
    return sortedProgress;
  } catch (error) {
    console.error('[FSRSDebugger] Error logging all user progress:', error);
    return [];
  }
};

/**
 * Log raw Irys data for a specific user and song
 * This is useful for debugging issues with the FSRS data
 * @param userId The user's Ethereum address
 * @param songId The song ID
 * @returns Promise with the raw Irys data or null if not found
 */
export const logIrysData = async (userId: string, songId: string): Promise<any | null> => {
  console.log(`[FSRSDebugger] Logging raw Irys data for userId=${userId}, songId=${songId}`);
  
  try {
    // Ensure Irys is initialized before proceeding
    await ensureIrysInitialized(userId);
    
    // Determine if we're using devnet based on the Irys client configuration
    const isDevnet = (irysService as any).isDevnet;
    
    // Determine the GraphQL endpoint based on network configuration
    const graphqlUrl = isDevnet 
      ? 'https://devnet.irys.xyz/graphql' 
      : 'https://uploader.irys.xyz/graphql';
    
    // Determine the gateway URL based on network configuration
    const gatewayUrl = isDevnet 
      ? 'https://devnet.irys.xyz' 
      : 'https://gateway.irys.xyz';
    
    console.log(`[FSRSDebugger] Using GraphQL endpoint: ${graphqlUrl}`);
    
    // Construct the GraphQL query
    const graphqlQuery = {
      query: `
        query {
          transactions(
            tags: [
              {
                name: "App-Name",
                values: ["Scarlett"]
              },
              {
                name: "Type",
                values: ["user-progress"]
              },
              {
                name: "User-Id",
                values: ["${userId}"]
              }${songId ? `,
              {
                name: "Song-Id",
                values: ["${songId}"]
              }` : ''}
            ],
            ${songId ? 'limit: 1,' : ''}
            order: DESC
          ) {
            edges {
              node {
                id
                tags {
                  name
                  value
                }
              }
            }
          }
        }
      `
    };
    
    console.log(`[FSRSDebugger] Querying transactions with GraphQL`);
    console.log(`[FSRSDebugger] Query:`, graphqlQuery.query);
    
    // Execute the GraphQL query
    const response = await fetch(graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(graphqlQuery),
    });
    
    if (!response.ok) {
      throw new Error(`GraphQL query failed: ${response.status} ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // Check if we have any results
    if (!result.data?.transactions?.edges || result.data.transactions.edges.length === 0) {
      console.log('[FSRSDebugger] No Irys transactions found');
      return null;
    }
    
    console.log(`[FSRSDebugger] Found ${result.data.transactions.edges.length} Irys transactions`);
    
    // Get the latest transaction
    const latestTx = result.data.transactions.edges[0].node;
    console.log('[FSRSDebugger] Latest transaction:', latestTx);
    
    // If we found a transaction, fetch its data
    if (latestTx) {
      console.log(`[FSRSDebugger] Found latest transaction: ${latestTx.id}`);
      
      // Fetch the transaction data
      const dataUrl = `${gatewayUrl}/${latestTx.id}`;
      const txResponse = await fetch(dataUrl);
      
      if (!txResponse.ok) {
        throw new Error(`Failed to fetch transaction data: ${txResponse.status} ${txResponse.statusText}`);
      }
      
      const txData = await txResponse.json();
      console.log('[FSRSDebugger] Transaction data:', txData);
      
      return txData;
    }
  } catch (error) {
    console.error('[FSRSDebugger] Error logging Irys data:', error);
    return null;
  }
};

/**
 * Calculate the average value of a specific FSRS property across questions
 */
const calculateAverage = (questions: any[], property: string): number => {
  const validQuestions = questions.filter(q => q.fsrs && typeof q.fsrs[property] === 'number');
  
  if (validQuestions.length === 0) return 0;
  
  const sum = validQuestions.reduce((acc, q) => acc + q.fsrs[property], 0);
  return parseFloat((sum / validQuestions.length).toFixed(2));
};

/**
 * Count questions by their FSRS state
 */
const countByState = (questions: any[]): Record<string, number> => {
  const states: Record<string, number> = {
    'new': 0,
    'learning': 0,
    'review': 0,
    'relearning': 0,
    'unknown': 0
  };
  
  questions.forEach(q => {
    if (!q.fsrs) {
      states.new++;
    } else {
      switch (q.fsrs.state) {
        case 0: states.new++; break;
        case 1: states.learning++; break;
        case 2: states.review++; break;
        case 3: states.relearning++; break;
        default: states.unknown++;
      }
    }
  });
  
  return states;
};

/**
 * Get the next due dates for questions
 */
const getNextDueDates = (questions: any[]): any[] => {
  const now = new Date();
  
  // Filter questions with FSRS data and due dates
  const questionsWithDueDates = questions
    .filter(q => q.fsrs && q.fsrs.due)
    .map(q => ({
      uuid: q.uuid,
      due: new Date(q.fsrs.due),
      daysUntilDue: Math.ceil((new Date(q.fsrs.due).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    }))
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  
  return questionsWithDueDates.slice(0, 10); // Return only the next 10 due questions
};

export default {
  logFsrsProgress,
  logAllUserProgress,
  logIrysData
}; 