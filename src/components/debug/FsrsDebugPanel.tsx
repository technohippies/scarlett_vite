import React, { useState, useEffect } from 'react';
import { useAppKit } from '../../context/ReownContext';
import { logFsrsProgress, logAllUserProgress, logIrysData } from '../../utils/fsrsDebugger';
import { irysService } from '../../lib/irys/client';

interface FsrsDebugPanelProps {
  songId?: string;
  onClose?: () => void;
}

const FsrsDebugPanel: React.FC<FsrsDebugPanelProps> = ({ songId, onClose }) => {
  const appKit = useAppKit();
  const address = appKit?.address || null;
  
  console.log('[FsrsDebugPanel] Rendering with:', { 
    address, 
    songId, 
    appKitConnected: !!appKit?.isConnected 
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllProgress, setShowAllProgress] = useState(false);
  const [allProgress, setAllProgress] = useState<any[]>([]);
  const [isLoggingRawData, setIsLoggingRawData] = useState(false);
  const [irysInitialized, setIrysInitialized] = useState(false);

  // Check if Irys is initialized
  useEffect(() => {
    const checkIrysInitialization = async () => {
      try {
        console.log('[FsrsDebugPanel] Checking Irys initialization status...');
        // @ts-ignore - Accessing private property for debugging
        const isInit = irysService.isInitialized;
        setIrysInitialized(isInit);
        console.log('[FsrsDebugPanel] Irys initialized:', isInit);
        
        if (!isInit && appKit?.ethersProvider) {
          console.log('[FsrsDebugPanel] Attempting to initialize Irys...');
          try {
            await irysService.init(appKit.ethersProvider, true); // Use devnet
            setIrysInitialized(true);
            console.log('[FsrsDebugPanel] Irys initialized successfully');
          } catch (initErr) {
            console.error('[FsrsDebugPanel] Failed to initialize Irys:', initErr);
          }
        }
      } catch (err) {
        console.error('[FsrsDebugPanel] Error checking Irys initialization:', err);
      }
    };
    
    checkIrysInitialization();
  }, [appKit?.ethersProvider]);

  // Load FSRS data for the current user and song
  const loadFsrsData = async () => {
    if (!address) {
      setError('No wallet connected. Please connect your wallet first.');
      return;
    }

    if (!songId && !showAllProgress) {
      setError('No song ID provided. Please provide a song ID or view all progress.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log('[FsrsDebugPanel] Loading FSRS data with:', { 
        address, 
        songId, 
        showAllProgress,
        irysInitialized
      });
      
      if (showAllProgress) {
        console.log('[FsrsDebugPanel] Fetching all user progress...');
        const progress = await logAllUserProgress(address);
        console.log('[FsrsDebugPanel] All progress fetched:', progress);
        setAllProgress(progress);
      } else if (songId) {
        console.log('[FsrsDebugPanel] Fetching FSRS progress for song...');
        const data = await logFsrsProgress(address, songId);
        console.log('[FsrsDebugPanel] FSRS data fetched:', data);
        setDebugData(data);
      }
    } catch (err) {
      console.error('[FsrsDebugPanel] Error loading FSRS data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Load raw Irys data for debugging
  const handleLogRawData = async () => {
    if (!address || !songId) {
      setError('Need both user address and song ID to log raw data.');
      return;
    }

    setIsLoggingRawData(true);
    setError(null);

    try {
      await logIrysData(address, songId);
      console.log('[FsrsDebugPanel] Raw Irys data logged to console');
    } catch (err) {
      console.error('Error logging raw Irys data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setIsLoggingRawData(false);
    }
  };

  // Load data when component mounts or when dependencies change
  useEffect(() => {
    if (address && (songId || showAllProgress)) {
      loadFsrsData();
    }
  }, [address, songId, showAllProgress]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-neutral-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-neutral-700 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">FSRS Debug Panel</h2>
          <button 
            onClick={onClose} 
            className="text-neutral-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        <div className="p-4">
          {/* User info */}
          <div className="mb-4 p-3 bg-neutral-700 rounded-lg">
            <h3 className="font-semibold mb-2">User Info</h3>
            <p className="text-sm break-all">Address: {address || 'Not connected'}</p>
            {songId && <p className="text-sm">Song ID: {songId}</p>}
          </div>

          {/* Controls */}
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setShowAllProgress(false);
                loadFsrsData();
              }}
              disabled={!address || !songId || isLoading}
              className="px-3 py-1 bg-indigo-600 text-white rounded-md disabled:opacity-50"
            >
              Refresh Song Data
            </button>
            
            <button
              onClick={() => {
                setShowAllProgress(true);
                loadFsrsData();
              }}
              disabled={!address || isLoading}
              className="px-3 py-1 bg-purple-600 text-white rounded-md disabled:opacity-50"
            >
              View All Progress
            </button>

            <button
              onClick={handleLogRawData}
              disabled={!address || !songId || isLoggingRawData}
              className="px-3 py-1 bg-green-600 text-white rounded-md disabled:opacity-50"
            >
              {isLoggingRawData ? 'Logging...' : 'Log Raw Irys Data'}
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex justify-center items-center p-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
              <span className="ml-2">Loading FSRS data...</span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-900 bg-opacity-30 text-red-300 rounded-lg">
              {error}
            </div>
          )}

          {/* Debug data display */}
          {!isLoading && !error && debugData && !showAllProgress && (
            <div className="space-y-4">
              <div className="p-3 bg-neutral-700 rounded-lg">
                <h3 className="font-semibold mb-2">FSRS Statistics</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total Questions: {debugData.stats.totalQuestions}</div>
                  <div>Due Questions: {debugData.stats.dueQuestions}</div>
                  <div>Avg Stability: {debugData.stats.averageStability}</div>
                  <div>Avg Difficulty: {debugData.stats.averageDifficulty}</div>
                  <div>Avg Reps: {debugData.stats.averageReps}</div>
                </div>
              </div>

              <div className="p-3 bg-neutral-700 rounded-lg">
                <h3 className="font-semibold mb-2">Questions by State</h3>
                <div className="grid grid-cols-5 gap-2 text-sm">
                  {Object.entries(debugData.stats.questionsByState).map(([state, count]) => (
                    <div key={state}>
                      {state}: {count as number}
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-neutral-700 rounded-lg">
                <h3 className="font-semibold mb-2">Next Due Questions</h3>
                {debugData.stats.nextDueDates.length > 0 ? (
                  <div className="text-sm space-y-1">
                    {debugData.stats.nextDueDates.map((item: any, index: number) => (
                      <div key={index} className="flex justify-between">
                        <span className="truncate max-w-[200px]">{item.uuid}</span>
                        <span>{item.daysUntilDue} days</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-neutral-400">No due questions found</p>
                )}
              </div>

              <div className="p-3 bg-neutral-700 rounded-lg">
                <h3 className="font-semibold mb-2">Sample Questions</h3>
                <div className="space-y-2 text-sm">
                  {debugData.fsrsData?.questions.slice(0, 5).map((q: any, index: number) => (
                    <div key={index} className="p-2 bg-neutral-600 rounded">
                      <div className="font-medium">Question {index + 1}</div>
                      <div className="text-xs">UUID: {q.uuid}</div>
                      <div className="text-xs">Correct: {q.correct ? 'Yes' : 'No'}</div>
                      {q.fsrs ? (
                        <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1">
                          <div className="text-xs">Due: {new Date(q.fsrs.due).toLocaleString()}</div>
                          <div className="text-xs">State: {q.fsrs.state}</div>
                          <div className="text-xs">Stability: {q.fsrs.stability.toFixed(2)}</div>
                          <div className="text-xs">Difficulty: {q.fsrs.difficulty.toFixed(2)}</div>
                          <div className="text-xs">Reps: {q.fsrs.reps}</div>
                          <div className="text-xs">Lapses: {q.fsrs.lapses}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-neutral-400">No FSRS data</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* All progress data display */}
          {!isLoading && !error && showAllProgress && (
            <div className="space-y-4">
              <h3 className="font-semibold">All Progress Entries ({allProgress.length})</h3>
              
              {allProgress.length === 0 ? (
                <p className="text-neutral-400">No progress entries found</p>
              ) : (
                <div className="space-y-2">
                  {allProgress.map((entry, index) => (
                    <div key={index} className="p-3 bg-neutral-700 rounded-lg">
                      <div className="flex justify-between mb-2">
                        <span className="font-medium">Song ID: {entry.songId}</span>
                        <span className="text-sm text-neutral-400">
                          {new Date(entry.completedAt).toLocaleString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Questions: {entry.totalQuestions}</div>
                        <div>Correct: {entry.correctAnswers}</div>
                        <div>Accuracy: {(entry.accuracy * 100).toFixed(1)}%</div>
                        <div>Has FSRS: {entry.questions.some((q: any) => !!q.fsrs) ? 'Yes' : 'No'}</div>
                      </div>
                      <button
                        onClick={() => {
                          setShowAllProgress(false);
                          setDebugData(null);
                          setTimeout(() => {
                            logFsrsProgress(address!, entry.songId).then(setDebugData);
                          }, 100);
                        }}
                        className="mt-2 px-2 py-1 text-xs bg-indigo-600 text-white rounded"
                      >
                        View Details
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FsrsDebugPanel; 