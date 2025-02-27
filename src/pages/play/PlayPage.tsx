import React from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { Play, Pause, SkipBack, SkipForward } from '@phosphor-icons/react';

const PlayPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t } = useTranslation();
  const { song, loading, error } = useSongByTitle(title || null);
  const [isPlaying, setIsPlaying] = React.useState(false);
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
      </div>
    );
  }
  
  if (error || !song) {
    return (
      <div className="bg-red-50 text-red-500 p-6 rounded-lg text-center">
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
        <p>{error?.message || t('song.notFound')}</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col">
      <div className="text-center mb-8">
        <img 
          src={`https://premium.aiozpin.network/ipfs/${song.cover_img_cid}`}
          alt={song.song_title}
          className="w-64 h-64 object-cover mx-auto rounded-lg shadow-lg mb-6"
        />
        <h1 className="text-2xl font-bold">{song.song_title}</h1>
        <h2 className="text-lg text-gray-600">{song.song_title_translated}</h2>
        <p className="mt-2 text-gray-500">{song.artist_name}</p>
      </div>
      
      {/* Lyrics section (placeholder) */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 mb-8 max-h-[300px] overflow-y-auto">
        <p className="text-center text-gray-500">
          {t('play.lyricsLoading')}
        </p>
      </div>
      
      {/* Player controls */}
      <div className="bg-white rounded-lg p-6 border border-gray-200 fixed bottom-16 left-0 right-0 mx-4">
        {/* Progress bar */}
        <div className="mb-4">
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 w-[30%]"></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>0:37</span>
            <span>2:02</span>
          </div>
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-center gap-8">
          <button className="text-gray-600">
            <SkipBack size={24} weight="fill" />
          </button>
          
          <button 
            className="bg-indigo-600 text-white rounded-full p-4"
            onClick={() => setIsPlaying(prev => !prev)}
          >
            {isPlaying ? (
              <Pause size={32} weight="fill" />
            ) : (
              <Play size={32} weight="fill" />
            )}
          </button>
          
          <button className="text-gray-600">
            <SkipForward size={24} weight="fill" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlayPage; 