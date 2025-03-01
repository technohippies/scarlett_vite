/**
 * API Handler
 * 
 * This file provides a simple API handler for the application
 * It routes requests to the appropriate API functions
 */

import * as irysApi from './irysApi';
import * as fsrsDebug from './fsrsDebug';

// Define the API routes
const API_ROUTES = {
  // Irys API routes
  '/api/irys/progress': (params: URLSearchParams) => {
    const userId = params.get('userId');
    const songId = params.get('songId');
    
    if (!userId || !songId) {
      return {
        success: false,
        message: 'Missing required parameters: userId and songId',
        data: null
      };
    }
    
    return irysApi.getProgress(userId, songId);
  },
  
  '/api/irys/save': async (_params: URLSearchParams, body: any) => {
    if (!body) {
      return {
        success: false,
        message: 'Missing request body',
        id: null
      };
    }
    
    return irysApi.saveProgress(body);
  },
  
  // FSRS Debug API routes
  '/api/fsrs/debug': (params: URLSearchParams) => {
    const userId = params.get('userId');
    const songId = params.get('songId');
    
    if (!userId || !songId) {
      return {
        success: false,
        message: 'Missing required parameters: userId and songId',
        data: null
      };
    }
    
    return fsrsDebug.getFsrsDebugData(userId, songId);
  },
  
  '/api/fsrs/all-progress': (params: URLSearchParams) => {
    const userId = params.get('userId');
    
    if (!userId) {
      return {
        success: false,
        message: 'Missing required parameter: userId',
        data: null
      };
    }
    
    return fsrsDebug.getAllUserProgress(userId);
  },
  
  '/api/fsrs/raw-data': (params: URLSearchParams) => {
    const userId = params.get('userId');
    const songId = params.get('songId');
    
    if (!userId || !songId) {
      return {
        success: false,
        message: 'Missing required parameters: userId and songId',
        data: null
      };
    }
    
    return fsrsDebug.getRawIrysData(userId, songId);
  }
};

// Initialize the API handler
export function initApiHandler() {
  // Intercept fetch requests to our API routes
  const originalFetch = window.fetch;
  
  window.fetch = async function(input: RequestInfo | URL, init?: RequestInit) {
    // Convert input to string URL
    const inputUrl = typeof input === 'string' 
      ? input 
      : input instanceof Request 
        ? input.url 
        : input.toString();
    
    // Check if this is one of our API routes
    const apiRoute = Object.keys(API_ROUTES).find(route => inputUrl.startsWith(route));
    
    if (apiRoute) {
      console.log(`[API Handler] Intercepting request to ${inputUrl}`);
      
      try {
        // Parse URL parameters
        const urlObj = new URL(inputUrl, window.location.origin);
        const params = urlObj.searchParams;
        
        // Parse request body if it exists
        let body = null;
        if (init?.body) {
          try {
            body = JSON.parse(init.body.toString());
          } catch (e) {
            console.error('[API Handler] Failed to parse request body:', e);
          }
        }
        
        // Call the appropriate API function
        const apiFunction = API_ROUTES[apiRoute as keyof typeof API_ROUTES];
        const result = await apiFunction(params, body);
        
        // Return a mock response
        return new Response(JSON.stringify(result), {
          status: result.success ? 200 : 400,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      } catch (error) {
        console.error(`[API Handler] Error handling request to ${inputUrl}:`, error);
        
        // Return an error response
        return new Response(JSON.stringify({
          success: false,
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          data: null
        }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        });
      }
    }
    
    // Pass through to the original fetch for non-API routes
    return originalFetch.call(window, input, init);
  };
  
  console.log('[API Handler] Initialized');
}

export default {
  initApiHandler
}; 