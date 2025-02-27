import { useState, useEffect } from 'react';
import { Song } from '../types/song';
import { getAllSongs, getSongById, getSongByTitle } from '../lib/tableland/client';

export function useAllSongs() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchSongs = async () => {
      try {
        setLoading(true);
        const data = await getAllSongs();
        setSongs(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch songs'));
      } finally {
        setLoading(false);
      }
    };

    fetchSongs();
  }, []);

  return { songs, loading, error };
}

export function useSongById(id: number | null) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (id === null) {
      setLoading(false);
      return;
    }

    const fetchSong = async () => {
      try {
        setLoading(true);
        const data = await getSongById(id);
        setSong(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(`Failed to fetch song #${id}`));
      } finally {
        setLoading(false);
      }
    };

    fetchSong();
  }, [id]);

  return { song, loading, error };
}

export function useSongByTitle(title: string | null) {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (title === null) {
      setLoading(false);
      return;
    }

    const fetchSong = async () => {
      try {
        setLoading(true);
        const data = await getSongByTitle(title);
        setSong(data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error(`Failed to fetch song "${title}"`));
      } finally {
        setLoading(false);
      }
    };

    fetchSong();
  }, [title]);

  return { song, loading, error };
} 