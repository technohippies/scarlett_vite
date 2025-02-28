import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSongByTitle } from '../../../hooks/useSongs';
import { Trophy, Share, House, Confetti } from '@phosphor-icons/react';
import { useXmtp } from '../../../context/XmtpContext';
import { irysService } from '../../../lib/irys/client';
import Spinner from '../../../components/ui/Spinner';
import { ethers } from 'ethers';

interface QuestionStats {
  totalQuestions: number;
  correctAnswers: number;
  songId: string;
  completedAt: number;
  questions: Array<{
    uuid: string;
    selectedAnswer: string;
    isCorrect: boolean;
    fsrs?: any;
  }>;
}

const ConfirmationPage: React.FC = () => {
  const { title } = useParams<{ title: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { song, loading, error } = useSongByTitle(title || null);
  const xmtpContext = useXmtp();
  
  const [stats, setStats] = useState<QuestionStats | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);
  
  // Get stats from location state or localStorage
  useEffect(() => {
    console.log('ConfirmationPage: Checking for stats data');
    // First try to get stats from location state
    if (location.state?.stats) {
      console.log('ConfirmationPage: Found stats in location state:', location.state.stats);
      setStats(location.state.stats);
      return;
    }
    
    // Otherwise try to get from localStorage
    try {
      const savedStats = localStorage.getItem('questionStats');
      const savedAnswers = localStorage.getItem('questionAnswers');
      
      console.log('ConfirmationPage: Checking localStorage for stats');
      console.log('ConfirmationPage: savedStats exists:', !!savedStats);
      console.log('ConfirmationPage: savedAnswers exists:', !!savedAnswers);
      
      if (savedStats && savedAnswers) {
        const parsedStats = JSON.parse(savedStats);
        const parsedAnswers = JSON.parse(savedAnswers);
        
        console.log('ConfirmationPage: Parsed stats from localStorage:', parsedStats);
        console.log('ConfirmationPage: Parsed answers from localStorage:', parsedAnswers);
        
        setStats({
          ...parsedStats,
          questions: parsedAnswers
        });
      } else {
        console.log('ConfirmationPage: No stats found in localStorage');
      }
    } catch (err) {
      console.error('Failed to load stats from localStorage:', err);
    }
  }, [location.state]);
  
  const handleSaveProgress = async () => {
    console.log('ConfirmationPage: Save progress button clicked');
    console.log('ConfirmationPage: Stats available:', !!stats);
    console.log('ConfirmationPage: XMTP context available:', !!xmtpContext);
    console.log('ConfirmationPage: XMTP connected:', xmtpContext?.isConnected);
    console.log('ConfirmationPage: Song available:', !!song);
    console.log('ConfirmationPage: window.ethereum available:', !!window.ethereum);
    
    let debugMessages = [];
    debugMessages.push(`Button clicked at: ${new Date().toISOString()}`);
    setDebugInfo(debugMessages.join('\n'));
    
    if (!stats || !xmtpContext || !song || !xmtpContext.isConnected) {
      const reason = !stats ? 'No stats available' : 
                    !xmtpContext ? 'No XMTP context' : 
                    !song ? 'No song data' : 
                    !xmtpContext.isConnected ? 'XMTP not connected' : 'Unknown reason';
      
      console.error(`ConfirmationPage: Cannot save progress - ${reason}`);
      debugMessages.push(`Cannot save: ${reason}`);
      setDebugInfo(debugMessages.join('\n'));
      setSaveError(t('confirmation.cannotSave'));
      return;
    }
    
    if (!window.ethereum) {
      console.error('ConfirmationPage: No Ethereum provider available');
      debugMessages.push('Cannot save: No Ethereum provider');
      setDebugInfo(debugMessages.join('\n'));
      setSaveError(t('confirmation.cannotSave'));
      return;
    }
    
    setIsSaving(true);
    setSaveError(null);
    
    try {
      // Log basic ethereum info
      console.log('ConfirmationPage: window.ethereum available:', !!window.ethereum);
      debugMessages.push(`Ethereum provider available: ${!!window.ethereum}`);
      setDebugInfo(debugMessages.join('\n'));
      
      // Create a provider for Irys
      console.log('ConfirmationPage: Creating Ethereum provider');
      debugMessages.push('Creating Ethereum provider...');
      setDebugInfo(debugMessages.join('\n'));
      
      // Try to request accounts first to ensure connection
      debugMessages.push('Requesting accounts...');
      setDebugInfo(debugMessages.join('\n'));
      
      try {
        // Use a type assertion to access the request method
        const ethereum = window.ethereum as any;
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        console.log('ConfirmationPage: Accounts:', accounts);
        debugMessages.push(`Accounts received: ${accounts ? accounts.join(', ') : 'none'}`);
      } catch (err) {
        console.error('ConfirmationPage: Failed to request accounts:', err);
        debugMessages.push(`Failed to request accounts: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum as any);
      console.log('ConfirmationPage: Provider created');
      debugMessages.push('Provider created successfully');
      setDebugInfo(debugMessages.join('\n'));
      
      console.log('ConfirmationPage: Getting signer');
      debugMessages.push('Getting signer...');
      setDebugInfo(debugMessages.join('\n'));
      
      let signer;
      try {
        signer = await provider.getSigner();
        console.log('ConfirmationPage: Signer obtained');
        debugMessages.push('Signer obtained successfully');
      } catch (err) {
        console.error('ConfirmationPage: Failed to get signer:', err);
        debugMessages.push(`Failed to get signer: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
      
      console.log('ConfirmationPage: Getting user address');
      debugMessages.push('Getting user address...');
      setDebugInfo(debugMessages.join('\n'));
      
      let userAddress;
      try {
        userAddress = await signer.getAddress();
        console.log('ConfirmationPage: User address:', userAddress);
        debugMessages.push(`User address: ${userAddress}`);
      } catch (err) {
        console.error('ConfirmationPage: Failed to get user address:', err);
        debugMessages.push(`Failed to get user address: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
      
      // Log stats data
      console.log('ConfirmationPage: Stats to be saved:', stats);
      console.log('ConfirmationPage: Questions count:', stats.questions.length);
      console.log('ConfirmationPage: First few questions:', stats.questions.slice(0, 3));
      
      // Initialize Irys with the user's wallet
      console.log('ConfirmationPage: Initializing Irys');
      debugMessages.push('Initializing Irys...');
      setDebugInfo(debugMessages.join('\n'));
      
      try {
        // Pass the provider directly to Irys
        await irysService.init(provider);
        console.log('ConfirmationPage: Irys initialized successfully');
        debugMessages.push('Irys initialized successfully');
      } catch (err) {
        console.error('ConfirmationPage: Failed to initialize Irys:', err);
        debugMessages.push(`Failed to initialize Irys: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
      
      // Format the progress data
      console.log('ConfirmationPage: Formatting progress data');
      debugMessages.push('Formatting progress data...');
      setDebugInfo(debugMessages.join('\n'));
      
      const progressData = {
        userId: userAddress,
        songId: String(song.id),
        questions: stats.questions,
        completedAt: stats.completedAt,
        totalQuestions: stats.totalQuestions,
        correctAnswers: stats.correctAnswers,
        accuracy: Math.round((stats.correctAnswers / stats.totalQuestions) * 100)
      };
      
      console.log('ConfirmationPage: Progress data prepared:', progressData);
      debugMessages.push(`Progress data prepared for user: ${userAddress.substring(0, 8)}...`);
      setDebugInfo(debugMessages.join('\n'));
      
      // Save to Irys
      console.log('ConfirmationPage: Saving to Irys');
      debugMessages.push('Saving to Irys...');
      setDebugInfo(debugMessages.join('\n'));
      
      try {
        const txId = await irysService.saveProgress(progressData);
        console.log('ConfirmationPage: Saved progress to Irys with transaction ID:', txId);
        debugMessages.push(`Success! Transaction ID: ${txId}`);
        setDebugInfo(debugMessages.join('\n'));
        
        setSaveSuccess(true);
      } catch (err) {
        console.error('ConfirmationPage: Failed to save progress to Irys:', err);
        debugMessages.push(`Error during save: ${err instanceof Error ? err.message : String(err)}`);
        setDebugInfo(debugMessages.join('\n'));
        throw err;
      }
    } catch (err) {
      console.error('ConfirmationPage: Failed to save progress to Irys:', err);
      debugMessages.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
      setDebugInfo(debugMessages.join('\n'));
      setSaveError(t('confirmation.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="md" />
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
  
  if (!stats) {
    return (
      <div className="bg-yellow-900/20 text-yellow-400 p-6 rounded-lg text-center">
        <h2 className="text-xl font-bold mb-2">{t('confirmation.noStats')}</h2>
        <p>{t('confirmation.noStatsMessage')}</p>
        <button
          onClick={() => navigate(`/song/${title}/study`)}
          className="mt-4 bg-neutral-800 text-white py-2 px-4 rounded-lg"
        >
          {t('confirmation.tryAgain')}
        </button>
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
          <h1 className="text-2xl font-bold mb-2">{t('confirmation.congratulations')}</h1>
          <p className="text-neutral-300">
            {t('confirmation.finishedSong', { title: song.song_title })}
          </p>
        </div>
        
        {/* Stats */}
        <div className="bg-neutral-800 rounded-lg border border-neutral-700 p-6 w-full mb-8">
          <h2 className="text-lg font-bold mb-4">{t('confirmation.yourProgress')}</h2>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('confirmation.questionsAnswered')}</span>
              <span className="font-medium">{stats.totalQuestions}/{stats.totalQuestions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('confirmation.correctAnswers')}</span>
              <span className="font-medium">{stats.correctAnswers}/{stats.totalQuestions}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-neutral-300">{t('confirmation.accuracy')}</span>
              <span className="font-medium">{Math.round((stats.correctAnswers / stats.totalQuestions) * 100)}%</span>
            </div>
          </div>
        </div>
        
        {/* Action buttons */}
        <div className="grid grid-cols-1 gap-4 w-full">
          {!saveSuccess ? (
            <button
              onClick={handleSaveProgress}
              className="bg-indigo-600 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
              disabled={isSaving}
            >
              {isSaving ? (
                <>
                  <Spinner size="sm" />
                  {t('confirmation.saving')}
                </>
              ) : (
                <>
                  <Confetti size={20} weight="bold" />
                  {t('confirmation.saveProgress')}
                </>
              )}
            </button>
          ) : (
            <div className="bg-green-900/20 text-green-400 p-4 rounded-lg text-center mb-4">
              {t('confirmation.saveSuccess')}
            </div>
          )}
          
          {saveError && (
            <div className="bg-red-900/20 text-red-400 p-4 rounded-lg text-center mb-4">
              {saveError}
            </div>
          )}
          
          {debugInfo && (
            <div className="bg-neutral-800 text-neutral-300 p-4 rounded-lg text-left mb-4 font-mono text-xs overflow-auto max-h-40">
              <h3 className="font-bold mb-2">Debug Info:</h3>
              <pre>{debugInfo}</pre>
            </div>
          )}
          
          <button className="bg-neutral-800 border border-neutral-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium">
            <Share size={20} weight="bold" />
            {t('confirmation.shareProgress')}
          </button>
          
          <button
            onClick={() => navigate('/')}
            className="bg-neutral-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 font-medium"
          >
            <House size={20} weight="bold" />
            {t('confirmation.goHome')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationPage; 