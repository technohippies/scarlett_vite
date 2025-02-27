import { Question } from '../../types/song';
import { ipfsCidToUrl } from '../tableland/client';

/**
 * Fetch questions from IPFS by CID
 */
export async function fetchQuestionsByCid(cid: string): Promise<Question[]> {
  try {
    const response = await fetch(ipfsCidToUrl(cid));
    
    if (!response.ok) {
      throw new Error(`Failed to fetch questions: ${response.statusText}`);
    }
    
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
    const response = await fetch(ipfsCidToUrl(cid));
    
    if (!response.ok) {
      throw new Error(`Failed to fetch lyrics: ${response.statusText}`);
    }
    
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
    const audio = new Audio(ipfsCidToUrl(cid));
    
    audio.addEventListener('canplaythrough', () => {
      resolve(audio);
    });
    
    audio.addEventListener('error', (error) => {
      reject(error);
    });
    
    audio.load();
  });
} 