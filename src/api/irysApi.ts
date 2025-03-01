/**
 * Irys API
 * 
 * This file provides API endpoints for interacting with Irys data
 * It can be used in both client-side and server-side contexts
 */

import { irysService } from '../lib/irys/client';

/**
 * Get the latest progress for a user and song from Irys
 */
export async function getProgress(userId: string, songId: string) {
  console.log(`[API] Getting progress for userId=${userId}, songId=${songId}`);
  
  try {
    // Get the latest progress from Irys service
    const progress = await irysService.getLatestProgress(userId, songId);
    
    if (!progress) {
      console.log('[API] No progress found');
      return {
        success: false,
        message: 'No progress found',
        data: null
      };
    }
    
    console.log(`[API] Retrieved progress data with ${progress.questions.length} questions`);
    
    return {
      success: true,
      message: 'Progress retrieved successfully',
      data: progress
    };
  } catch (error) {
    console.error('[API] Error getting progress:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      data: null
    };
  }
}

/**
 * Save progress to Irys
 */
export async function saveProgress(progress: any) {
  console.log(`[API] Saving progress for userId=${progress.userId}, songId=${progress.songId}`);
  
  try {
    // Save the progress using Irys service
    const txId = await irysService.saveProgress(progress);
    
    if (!txId) {
      throw new Error('Failed to save progress');
    }
    
    console.log(`[API] Progress saved successfully with ID: ${txId}`);
    
    return {
      success: true,
      message: 'Progress saved successfully',
      id: txId
    };
  } catch (error) {
    console.error('[API] Error saving progress:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      id: null
    };
  }
}

export default {
  getProgress,
  saveProgress
}; 