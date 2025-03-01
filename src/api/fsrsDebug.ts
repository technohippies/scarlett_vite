/**
 * FSRS Debug API
 * 
 * This file provides API endpoints for debugging FSRS data
 * It can be used in both client-side and server-side contexts
 */

import { fsrsService } from '../lib/fsrs/client';
import { irysService } from '../lib/irys/client';
import { Card } from 'ts-fsrs';

/**
 * Get FSRS debug data for a user and song
 */
export async function getFsrsDebugData(userId: string, songId: string) {
  console.log(`[API] Getting FSRS debug data for userId=${userId}, songId=${songId}`);
  
  try {
    // Get the latest progress from FSRS service
    const fsrsProgress = await fsrsService.getLatestProgress(userId, songId);
    
    if (!fsrsProgress) {
      console.log('[API] No FSRS progress found');
      return {
        success: false,
        message: 'No FSRS progress found',
        data: null
      };
    }
    
    // Calculate statistics
    const now = new Date();
    const dueQuestions = fsrsProgress.questions.filter(q => 
      q.fsrs && new Date(q.fsrs.due) <= now
    );
    
    // Calculate averages
    const calculateAverage = (property: keyof Card): number => {
      const validQuestions = fsrsProgress.questions.filter(q => q.fsrs && typeof q.fsrs[property] === 'number');
      if (validQuestions.length === 0) return 0;
      const sum = validQuestions.reduce((acc, q) => acc + (q.fsrs?.[property] as number || 0), 0);
      return parseFloat((sum / validQuestions.length).toFixed(2));
    };
    
    // Count by state
    const countByState = (): Record<string, number> => {
      const states: Record<string, number> = {
        'new': 0,
        'learning': 0,
        'review': 0,
        'relearning': 0,
        'unknown': 0
      };
      
      fsrsProgress.questions.forEach(q => {
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
    
    // Get next due dates
    const getNextDueDates = (): any[] => {
      return fsrsProgress.questions
        .filter(q => q.fsrs && q.fsrs.due)
        .map(q => {
          const dueDate = q.fsrs?.due ? new Date(q.fsrs.due) : new Date();
          return {
            uuid: q.uuid,
            due: dueDate,
            daysUntilDue: Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          };
        })
        .sort((a, b) => a.due.getTime() - b.due.getTime())
        .slice(0, 10);
    };
    
    // Prepare the response data
    const responseData = {
      userId: fsrsProgress.userId,
      songId: fsrsProgress.songId,
      completedAt: fsrsProgress.completedAt,
      totalQuestions: fsrsProgress.questions.length,
      dueQuestions: dueQuestions.length,
      stats: {
        averageStability: calculateAverage('stability'),
        averageDifficulty: calculateAverage('difficulty'),
        averageReps: calculateAverage('reps'),
        questionsByState: countByState(),
        nextDueDates: getNextDueDates()
      },
      sampleQuestions: fsrsProgress.questions.slice(0, 5).map(q => ({
        uuid: q.uuid,
        correct: q.correct,
        fsrs: q.fsrs ? {
          due: q.fsrs.due,
          state: q.fsrs.state,
          stability: q.fsrs.stability,
          difficulty: q.fsrs.difficulty,
          reps: q.fsrs.reps,
          lapses: q.fsrs.lapses,
          isDue: new Date(q.fsrs.due) <= now
        } : null
      }))
    };
    
    return {
      success: true,
      message: 'FSRS debug data retrieved successfully',
      data: responseData
    };
  } catch (error) {
    console.error('[API] Error getting FSRS debug data:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null
    };
  }
}

/**
 * Get all progress entries for a user
 */
export async function getAllUserProgress(userId: string) {
  console.log(`[API] Getting all progress for userId=${userId}`);
  
  try {
    // Get all progress entries from Irys service
    const allProgress = await irysService.getAllUserProgress(userId);
    
    if (!allProgress || allProgress.length === 0) {
      console.log('[API] No progress entries found');
      return {
        success: false,
        message: 'No progress entries found',
        data: []
      };
    }
    
    // Prepare the response data
    const responseData = allProgress.map(entry => ({
      songId: entry.songId,
      completedAt: entry.completedAt,
      totalQuestions: entry.totalQuestions,
      correctAnswers: entry.correctAnswers,
      accuracy: entry.accuracy,
      questionCount: entry.questions.length,
      hasFsrsData: entry.questions.some(q => !!q.fsrs)
    }));
    
    return {
      success: true,
      message: `Found ${responseData.length} progress entries`,
      data: responseData
    };
  } catch (error) {
    console.error('[API] Error getting all user progress:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      data: []
    };
  }
}

/**
 * Get raw Irys data for a specific user and song
 * This is useful for debugging issues with the FSRS data
 */
export async function getRawIrysData(userId: string, songId: string) {
  console.log(`[API] Getting raw Irys data for userId=${userId}, songId=${songId}`);
  
  try {
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
    
    console.log(`[API] Using GraphQL endpoint: ${graphqlUrl}`);
    
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
              },
              {
                name: "Song-Id",
                values: ["${songId}"]
              }
            ],
            first: 1,
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
    
    console.log(`[API] Querying transactions with GraphQL`);
    console.log(`[API] Query:`, graphqlQuery.query);
    
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
      console.log('[API] No Irys transactions found');
      return {
        success: false,
        message: 'No Irys transactions found',
        data: null
      };
    }
    
    console.log(`[API] Found ${result.data.transactions.edges.length} Irys transactions`);
    
    // Get the latest transaction
    const latestTx = result.data.transactions.edges[0].node;
    
    // Fetch the transaction data
    const dataUrl = `${gatewayUrl}/${latestTx.id}`;
    const txResponse = await fetch(dataUrl);
    if (!txResponse.ok) {
      throw new Error(`Failed to fetch transaction data: ${txResponse.status} ${txResponse.statusText}`);
    }
    
    const txData = await txResponse.json();
    
    return {
      success: true,
      message: 'Raw Irys data retrieved successfully',
      data: {
        transaction: latestTx,
        content: txData
      }
    };
  } catch (error) {
    console.error('[API] Error getting raw Irys data:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null
    };
  }
}

export default {
  getFsrsDebugData,
  getAllUserProgress,
  getRawIrysData
}; 