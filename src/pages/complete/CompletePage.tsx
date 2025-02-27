import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import { Trophy, Share, House, Confetti } from '@phosphor-icons/react';

const CompletePage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { song, loading, error } = useSongByTitle(title || null);
  
  const [isSaving, setIsSaving] = React.useState(false);
  
  const handleSaveProgress = async () => {
    setIsSaving(true);
    
    // Simulate saving to Irys
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsSaving(false);
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
        <h2 className="text-xl font-bold mb-2">{t('common.error')}</h2>
        <p>{error?.message || t('song.notFound')}</p>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col items-center justify-center">
        <div className="text-center mb-8">
          <div className="w-20 h-20 rounded-full bg-indigo-900/30 text-indigo-400 flex items-center justify-center mx-auto mb-6">
            <Trophy size={40} weight="fill" />
          </div>
          <h1 className="text-2xl font-bold mb-2">{t('complete.congratulations')}</h1>
          <p className="text-neutral-300">
            {t('complete.finishedSong', { title: song.song_title })}
          </p>
        </div>
        
        {/* Stats */}
        <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-6 w-full mb-8">
          <h2 className="text-lg font-bold mb-4">{t('complete.yourProgress')}</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('complete.questionsAnswered')}</span>
              <span className="font-medium">5/5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('complete.correctAnswers')}</span>
              <span className="font-medium">4/5</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('complete.accuracy')}</span>
              <span className="font-medium">80%</span>
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="grid grid-cols-1 gap-4 w-full">
          <button
            onClick={handleSaveProgress}
            className="bg-indigo-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                {t('complete.saving')}
              </>
            ) : (
              <>
                <Confetti size={20} weight="bold" />
                {t('complete.saveProgress')}
              </>
            )}
          </button>
          
          <button className="bg-neutral-800 border border-neutral-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium">
            <Share size={20} weight="bold" />
            {t('complete.shareProgress')}
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="bg-neutral-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <House size={20} weight="bold" />
            {t('complete.goHome')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CompletePage; 