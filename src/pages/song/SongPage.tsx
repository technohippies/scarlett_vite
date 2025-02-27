import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { ipfsCidToUrl } from '../../lib/tableland/client';
import { Play, BookOpen, ClockCounterClockwise, CircleWavyWarning, CaretLeft } from '@phosphor-icons/react';
import PageHeader from '../../components/layout/PageHeader';

const SongPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { song, loading, error } = useSongByTitle(title || null);
  const currentLanguage = i18n.language;
  
  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const getCefrLabel = (level: number) => {
    const levels = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    return levels[level - 1] || 'Unknown';
  };
  
  const handleGoBack = () => {
    navigate('/');
  };
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-400"></div>
      </div>
    );
  }
  
  if (error || !song) {
    return (
      <div className="bg-red-900/20 text-red-400 p-6 rounded-lg text-center">
        <CircleWavyWarning size={48} weight="bold" className="mx-auto mb-2" />
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
        <p>{error?.message || t('song.notFound')}</p>
        <Link to="/" className="mt-4 inline-block text-indigo-400">
          {t('common.goHome')}
        </Link>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-6">
      {/* Page header with back button */}
      <PageHeader
        leftIcon={<CaretLeft size={24} />}
        leftLink="/"
        title={song.song_title}
      />
      
      {/* Hero section with background image */}
      <div 
        className="relative min-h-[200px] bg-cover bg-center rounded-lg overflow-hidden mb-6"
        style={{ backgroundImage: `url(${ipfsCidToUrl(song.cover_img_cid)})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
        <div className="absolute bottom-0 left-0 p-6 text-white">
          <h1 className="text-2xl font-bold mb-1">{song.song_title}</h1>
          <h2 className="text-lg opacity-90">{song.song_title_translated}</h2>
          <p className="mt-2 opacity-80">{song.artist_name}</p>
        </div>
      </div>
      
      {/* Action buttons */}
      <div className="flex mb-8 gap-4">
        <Link 
          to={`/song/${song.song_title.toLowerCase().replace(/\s+/g, '-')}/play`}
          className="flex-1 bg-indigo-600 text-white rounded-full py-3 flex items-center justify-center gap-2 font-medium"
        >
          <Play size={20} weight="fill" />
          {t('song.play')}
        </Link>
        
        <Link 
          to={`/song/${song.song_title.toLowerCase().replace(/\s+/g, '-')}/study`}
          className="flex-1 bg-neutral-800 border border-neutral-700 text-white rounded-full py-3 flex items-center justify-center gap-2 font-medium"
        >
          <BookOpen size={20} weight="bold" />
          {t('song.study')}
        </Link>
      </div>
      
      {/* Song details */}
      <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-5">
        <h3 className="text-lg font-bold mb-4">{t('song.details')}</h3>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.artist')}</span>
            <span className="font-medium">{song.artist_name}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.duration')}</span>
            <span className="font-medium flex items-center gap-1">
              <ClockCounterClockwise size={16} />
              {formatDuration(song.song_duration)}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.level')}</span>
            <span className="font-medium">
              {getCefrLabel(song.cefr_level)}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.uniqueWords')}</span>
            <span className="font-medium">
              {currentLanguage === 'en' ? song.unique_words_1 : song.unique_words_2}
            </span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.wordsPerSecond')}</span>
            <span className="font-medium">{song.words_per_second.toFixed(1)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-neutral-400">{t('song.contentRating')}</span>
            <span className="font-medium">{song.rating}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SongPage; 