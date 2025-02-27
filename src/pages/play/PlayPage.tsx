import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { Play, Pause, SkipBack, SkipForward } from '@phosphor-icons/react';
import { ipfsCidToUrl } from '../../lib/tableland/client';

const PlayPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t } = useTranslation();
  const { song, loading, error } = useSongByTitle(title || null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400"></div>
      </div>
    );
  }
  
  if (error || !song) {
    return (
      <div className="bg-neutral-800 text-red-400 p-6 rounded-lg text-center border border-red-900/30">
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
        <p>{error?.message || t('song.notFound')}</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col">
      <div className="text-center mb-8">
        <img 
          src={ipfsCidToUrl(song.cover_img_cid)}
          alt={song.song_title}
          className="w-64 h-64 object-cover mx-auto rounded-lg shadow-lg mb-6"
        />
        <h1 className="text-2xl font-bold text-white">{song.song_title}</h1>
        <h2 className="text-lg text-neutral-400">{song.song_title_translated}</h2>
        <p className="mt-2 text-neutral-500">{song.artist_name}</p>
      </div>
      
      {/* Lyrics section (placeholder) */}
      <div className="bg-neutral-800 rounded-lg p-6 border border-neutral-700 mb-8 max-h-[300px] overflow-y-auto">
        <p className="text-center text-neutral-400">
          {t('play.lyricsLoading')}
        </p>
      </div>
      
      {/* Player controls */}
      <div className="flex justify-center items-center gap-6 mb-8">
        <button className="text-neutral-400 hover:text-white">
          <SkipBack size={24} weight="fill" />
        </button>
        
        <button 
          className="bg-indigo-600 text-white rounded-full p-4 hover:bg-indigo-700"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? (
            <Pause size={32} weight="fill" />
          ) : (
            <Play size={32} weight="fill" />
          )}
        </button>
        
        <button className="text-neutral-400 hover:text-white">
          <SkipForward size={24} weight="fill" />
        </button>
      </div>
      
      {/* Progress bar */}
      <div className="w-full max-w-md mx-auto mb-4">
        <div className="h-1 bg-neutral-700 rounded-full overflow-hidden">
          <div className="h-full bg-indigo-600 w-[30%]"></div>
        </div>
        <div className="flex justify-between text-xs text-neutral-400 mt-1">
          <span>0:36</span>
          <span>2:02</span>
        </div>
      </div>
    </div>
  );
};

export default PlayPage; 