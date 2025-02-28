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
    // Convert kebab-case to original format if needed
    const formattedTitle = title.includes('-') 
      ? title.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
      : title;
    
    console.log(`Looking up song with title: ${formattedTitle} (from URL: ${title})`);
    
    const response = await fetch(
      `${TABLELAND_API_URL}?statement=${encodeURIComponent(
        `SELECT * FROM ${SONG_TABLE} WHERE song_title = '${formattedTitle}'`
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
 * Convert an IPFS CID to a URL
 * @param cid IPFS CID
 * @returns URL to access the content
 */
export const ipfsCidToUrl = (cid: string): string => {
  if (!cid) return '';
  
  // If it's already a URL, return it
  if (cid.startsWith('http')) {
    return cid;
  }
  
  // If it's a path starting with /, it's a local file
  if (cid.startsWith('/')) {
    return cid;
  }
  
  // Use our proxy route to avoid CORS issues
  return `/ipfs/${cid}`;
}; 