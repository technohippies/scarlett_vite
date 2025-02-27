import { Database } from '@tableland/sdk';
import { Song } from '../../types/song';

// Constants for Tableland tables
const SONG_TABLE = 'song_v2_8453_22';
const TABLELAND_API_URL = 'https://tableland.network/api/v1/query';

/**
 * Fetch all songs from Tableland
 */
export async function getAllSongs(): Promise<Song[]> {
  try {
    const response = await fetch(
      `${TABLELAND_API_URL}?statement=${encodeURIComponent(
        `SELECT * FROM ${SONG_TABLE}`
      )}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch songs: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data as Song[];
  } catch (error) {
    console.error('Error fetching songs:', error);
    throw error;
  }
}

/**
 * Fetch a song by its ID
 */
export async function getSongById(id: number): Promise<Song | null> {
  try {
    const response = await fetch(
      `${TABLELAND_API_URL}?statement=${encodeURIComponent(
        `SELECT * FROM ${SONG_TABLE} WHERE id = ${id}`
      )}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch song: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.length > 0 ? data[0] as Song : null;
  } catch (error) {
    console.error(`Error fetching song #${id}:`, error);
    throw error;
  }
}

/**
 * Fetch a song by its title (used for routing)
 */
export async function getSongByTitle(title: string): Promise<Song | null> {
  try {
    const response = await fetch(
      `${TABLELAND_API_URL}?statement=${encodeURIComponent(
        `SELECT * FROM ${SONG_TABLE} WHERE song_title = '${title}'`
      )}`
    );
    
    if (!response.ok) {
      throw new Error(`Failed to fetch song: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.length > 0 ? data[0] as Song : null;
  } catch (error) {
    console.error(`Error fetching song "${title}":`, error);
    throw error;
  }
}

/**
 * Helper function to convert an IPFS CID to a URL
 */
export function ipfsCidToUrl(cid: string): string {
  return `https://premium.aiozpin.network/ipfs/${cid}`;
} 