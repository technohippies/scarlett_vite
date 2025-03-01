import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../hooks/useSongs';
import Spinner from '../../components/ui/Spinner';

const CompletePage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { loading } = useSongByTitle(title || null);
  
  // Redirect to the confirmation page
  useEffect(() => {
    console.log('CompletePage: Redirecting to confirmation page');
    
    // Check if we have stats in localStorage
    let hasStats = false;
    try {
      const savedStats = localStorage.getItem('questionStats');
      hasStats = !!savedStats;
      console.log('CompletePage: Stats found in localStorage:', hasStats);
    } catch (err) {
      console.error('CompletePage: Error checking localStorage:', err);
    }
    
    if (title && !loading) {
      // If we have stats, redirect to confirmation page
      if (hasStats) {
        console.log('CompletePage: Redirecting to confirmation page with stats');
        navigate(`/song/${title}/confirmation`, { replace: true });
      } else {
        // If no stats, redirect to the song page
        console.log('CompletePage: No stats found, redirecting to song page');
        navigate(`/song/${title}`, { replace: true });
      }
    }
  }, [title, loading, navigate]);
  
  // Show loading spinner while redirecting
  return (
    <div className="container mx-auto px-4 py-12 flex items-center justify-center">
      <div className="text-center">
        <Spinner size="lg" />
        <p className="mt-4 text-neutral-400">{t('common.redirecting')}...</p>
      </div>
    </div>
  );
};

export default CompletePage; 