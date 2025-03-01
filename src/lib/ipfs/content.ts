import { Question } from '../../types/song';
import { ipfsCidToUrl } from '../tableland/client';

// Define fallback IPFS gateways
const IPFS_GATEWAYS = [
  '/ipfs', // Local proxy (default)
  'https://cloudflare-ipfs.com/ipfs',
  'https://ipfs.io/ipfs',
  'https://gateway.pinata.cloud/ipfs'
];

/**
 * Fetch content from IPFS with fallback gateways
 */
async function fetchWithFallback(cid: string): Promise<Response> {
  let lastError;
  
  // Try each gateway in order
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = cid.startsWith('http') ? cid : `${gateway}/${cid.replace(/^\/ipfs\//, '')}`;
      console.log(`Trying IPFS gateway: ${url}`);
      
      const response = await fetch(url);
      if (response.ok) {
        console.log(`Successfully fetched from gateway: ${gateway}`);
        return response;
      }
      
      console.warn(`Gateway ${gateway} returned status ${response.status}`);
    } catch (error) {
      console.warn(`Gateway ${gateway} failed:`, error);
      lastError = error;
    }
  }
  
  // If all gateways fail, throw the last error
  throw lastError || new Error('All IPFS gateways failed');
}

/**
 * Fetch questions from IPFS by CID
 */
export async function fetchQuestionsByCid(cid: string): Promise<Question[]> {
  try {
    const response = await fetchWithFallback(cid);
    const questions = await response.json();
    return questions as Question[];
  } catch (error) {
    console.error('Error fetching questions:', error);
    throw error;
  }
}

/**
 * Fetch lyrics content from IPFS by CID
 */
export async function fetchLyricsByCid(cid: string): Promise<string> {
  try {
    const response = await fetchWithFallback(cid);
    const text = await response.text();
    return text;
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    throw error;
  }
}

/**
 * Preload audio from IPFS
 */
export function preloadAudio(cid: string): Promise<HTMLAudioElement> {
  return new Promise((resolve, reject) => {
    // Try to load audio with the default gateway first
    const audio = new Audio(ipfsCidToUrl(cid));
    
    audio.addEventListener('canplaythrough', () => {
      resolve(audio);
    });
    
    audio.addEventListener('error', async (error) => {
      console.warn('Error loading audio with default gateway, trying fallbacks:', error);
      
      // Try fallback gateways
      for (let i = 1; i < IPFS_GATEWAYS.length; i++) {
        try {
          const fallbackUrl = `${IPFS_GATEWAYS[i]}/${cid.replace(/^\/ipfs\//, '')}`;
          console.log(`Trying fallback audio gateway: ${fallbackUrl}`);
          
          const fallbackAudio = new Audio(fallbackUrl);
          
          // Create a promise to wait for the audio to load or fail
          const result = await new Promise<HTMLAudioElement>((res, rej) => {
            fallbackAudio.addEventListener('canplaythrough', () => res(fallbackAudio));
            fallbackAudio.addEventListener('error', rej);
            fallbackAudio.load();
          });
          
          resolve(result);
          return;
        } catch (fallbackError) {
          console.warn(`Fallback gateway ${IPFS_GATEWAYS[i]} failed for audio:`, fallbackError);
        }
      }
      
      // If all fallbacks fail, reject with the original error
      reject(error);
    });
    
    audio.load();
  });
} 