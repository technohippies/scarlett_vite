import { QuestionWithResponse } from '../../types/song';

// Define the structure for user progress data
export interface UserProgress {
  userId: string;
  songId: string;
  questions: Array<{
    uuid: string;
    selectedAnswer: string;
    isCorrect: boolean;
    fsrs?: {
      due: string | Date;
      state: number;
      stability: number;
      difficulty: number;
      elapsed_days: number;
      scheduled_days: number;
      reps: number;
      lapses: number;
      last_review?: string | Date;
    };
  }>;
  completedAt: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
}

// Define tags for Irys uploads
const PROGRESS_TAG = 'scarlett-tutor-progress';
const APP_NAME = 'scarlett-tutor';
const APP_VERSION = '1.0.0';

// Declare global window with ethereum property
declare global {
  interface Window {
    ethereum?: Record<string, unknown>;
  }
}

class IrysService {
  private webIrys: any = null;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the Irys client
   */
  async init(provider: any): Promise<void> {
    console.log('IrysService: init called with provider:', provider ? 'Provider provided' : 'No provider');
    
    if (this.isInitialized) {
      console.log('IrysService: Already initialized, returning early');
      return;
    }

    // If initialization is already in progress, return the existing promise
    if (this.initPromise) {
      console.log('IrysService: Initialization already in progress, returning existing promise');
      return this.initPromise;
    }

    // Create a new initialization promise
    this.initPromise = this._initializeIrys(provider);
    
    try {
      await this.initPromise;
      this.isInitialized = true;
      console.log('IrysService: Initialized successfully');
    } catch (error) {
      console.error('IrysService: Failed to initialize Irys:', error);
      // Reset the promise so we can try again
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Private method to handle the actual initialization
   */
  private async _initializeIrys(providerOrWallet: any): Promise<void> {
    console.log('IrysService: Starting initialization process');
    
    try {
      if (typeof window === 'undefined') {
        throw new Error("Window is not defined. This method should only be called in browser context.");
      }
      
      if (!window.ethereum && !providerOrWallet) {
        throw new Error("No Ethereum provider found. Please install a wallet.");
      }

      // Get the provider (either passed in or from window.ethereum)
      const ethProvider = providerOrWallet || window.ethereum;
      
      // Get the user's account to ensure wallet is connected
      try {
        const accounts = await (ethProvider as any).request({ 
          method: "eth_requestAccounts" 
        });
        
        if (!accounts || accounts.length === 0) {
          throw new Error("No accounts found. Please connect your wallet.");
        }
        
        console.log('IrysService: Connected with account:', accounts[0]);
      } catch (accountError) {
        console.error('IrysService: Failed to get accounts:', accountError);
        throw new Error('Failed to connect to wallet. Please make sure your wallet is unlocked and connected.');
      }
      
      // Use dynamic import() with a try-catch to handle module loading errors
      try {
        // We'll use Function constructor to avoid TypeScript errors with dynamic imports
        // This is a workaround for TypeScript not recognizing the dynamically imported modules
        const importModule = new Function('modulePath', 'return import(modulePath)');
        
        // Import the required modules
        const webUploadModule = await importModule('@irys/web-upload');
        const webEthereumModule = await importModule('@irys/web-upload-ethereum');
        
        // Initialize the Irys client
        this.webIrys = await webUploadModule.WebUploader(webEthereumModule.WebEthereum)
          .withProvider(ethProvider);
        
        console.log('IrysService: Irys client initialized successfully');
        console.log(`IrysService: Connected with address: ${this.webIrys.address}`);
      } catch (importError) {
        console.error('IrysService: Failed to initialize Irys client:', importError);
        throw new Error(`Failed to initialize Irys client: ${importError instanceof Error ? importError.message : String(importError)}`);
      }
    } catch (error) {
      console.error('IrysService: Failed to initialize Irys:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('IrysService: Error message:', error.message);
        console.error('IrysService: Error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Save user progress to Irys
   */
  async saveProgress(progress: UserProgress): Promise<string> {
    console.log('IrysService: saveProgress called with progress data');
    console.log('IrysService: Progress data:', JSON.stringify(progress, null, 2));
    
    if (!this.webIrys || !this.isInitialized) {
      console.error('IrysService: Irys not initialized');
      throw new Error('Irys not initialized');
    }

    try {
      // Prepare tags for the upload
      console.log('IrysService: Preparing tags for upload');
      const tags = [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'App-Name', value: APP_NAME },
        { name: 'App-Version', value: APP_VERSION },
        { name: 'Type', value: PROGRESS_TAG },
        { name: 'User-Id', value: progress.userId },
        { name: 'Song-Id', value: progress.songId },
        { name: 'Completed-At', value: progress.completedAt.toString() }
      ];
      
      console.log('IrysService: Tags prepared:', tags);
      
      // Upload the progress data
      console.log('IrysService: Starting upload to Irys');
      const dataToUpload = JSON.stringify(progress);
      console.log('IrysService: Data size:', dataToUpload.length, 'bytes');
      
      // For small uploads (< 100KB), no funding is needed
      // For larger uploads, we might need to fund the account first
      const receipt = await this.webIrys.upload(dataToUpload, { tags });
      
      console.log('IrysService: Upload successful');
      console.log('IrysService: Transaction ID:', receipt.id);
      console.log('IrysService: Upload result:', receipt);
      
      return receipt.id;
    } catch (error) {
      console.error('IrysService: Failed to save progress to Irys:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('IrysService: Error message:', error.message);
        console.error('IrysService: Error stack:', error.stack);
      }
      throw error;
    }
  }

  /**
   * Get the latest progress for a user and song
   */
  async getLatestProgress(userId: string, songId: string): Promise<UserProgress | null> {
    console.log('IrysService: getLatestProgress called', { userId, songId });
    
    try {
      // Query for the latest progress
      console.log('IrysService: Querying for latest progress');
      const query = `{
        transactions(
          tags: [
            { name: "Type", values: ["${PROGRESS_TAG}"] },
            { name: "User-Id", values: ["${userId}"] },
            { name: "Song-Id", values: ["${songId}"] }
          ],
          order: "DESC",
          limit: 1
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
              data {
                size
              }
            }
          }
        }
      }`;

      console.log('IrysService: Sending GraphQL query to Arweave');
      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const result = await response.json();
      console.log('IrysService: Query result:', result);
      
      if (result.data?.transactions?.edges?.length > 0) {
        const txId = result.data.transactions.edges[0].node.id;
        console.log('IrysService: Found transaction:', txId);
        
        // Fetch the actual data
        console.log('IrysService: Fetching data from Arweave');
        const dataResponse = await fetch(`https://arweave.net/${txId}`);
        const progressData = await dataResponse.json();
        console.log('IrysService: Retrieved progress data:', progressData);
        
        return progressData as UserProgress;
      }
      
      console.log('IrysService: No progress found for user and song');
      return null;
    } catch (error) {
      console.error('IrysService: Failed to get progress from Irys:', error);
      return null;
    }
  }

  /**
   * Get all progress entries for a user
   */
  async getAllUserProgress(userId: string): Promise<UserProgress[]> {
    console.log('IrysService: getAllUserProgress called', { userId });
    
    try {
      // Query for all progress entries for this user
      console.log('IrysService: Querying for all user progress');
      const query = `{
        transactions(
          tags: [
            { name: "Type", values: ["${PROGRESS_TAG}"] },
            { name: "User-Id", values: ["${userId}"] }
          ],
          order: "DESC"
        ) {
          edges {
            node {
              id
              tags {
                name
                value
              }
              data {
                size
              }
            }
          }
        }
      }`;

      console.log('IrysService: Sending GraphQL query to Arweave');
      const response = await fetch('https://arweave.net/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      const result = await response.json();
      console.log('IrysService: Query result:', result);
      
      if (result.data?.transactions?.edges?.length > 0) {
        console.log('IrysService: Found', result.data.transactions.edges.length, 'transactions');
        
        // Fetch all progress data in parallel
        const progressPromises = result.data.transactions.edges.map(async (edge: any) => {
          const txId = edge.node.id;
          console.log('IrysService: Fetching data for transaction:', txId);
          const dataResponse = await fetch(`https://arweave.net/${txId}`);
          return await dataResponse.json() as UserProgress;
        });
        
        const progressData = await Promise.all(progressPromises);
        console.log('IrysService: Retrieved all progress data');
        
        return progressData;
      }
      
      console.log('IrysService: No progress found for user');
      return [];
    } catch (error) {
      console.error('IrysService: Failed to get all user progress from Irys:', error);
      return [];
    }
  }

  /**
   * Format question data for saving to Irys
   */
  formatQuestionsForProgress(
    questions: QuestionWithResponse[],
    fsrsCards?: Map<string, any>
  ): UserProgress['questions'] {
    console.log('IrysService: formatQuestionsForProgress called');
    console.log('IrysService: Questions count:', questions.length);
    console.log('IrysService: FSRS cards available:', !!fsrsCards);
    
    const formattedQuestions = questions
      .filter(q => q.userAnswer !== undefined)
      .map(q => {
        const fsrsCard = fsrsCards?.get(q.uuid);
        
        return {
          uuid: q.uuid,
          selectedAnswer: q.userAnswer || '',
          isCorrect: q.isCorrect || false,
          fsrs: fsrsCard ? {
            due: fsrsCard.due.toISOString(),
            state: fsrsCard.state,
            stability: fsrsCard.stability,
            difficulty: fsrsCard.difficulty,
            elapsed_days: fsrsCard.elapsed_days,
            scheduled_days: fsrsCard.scheduled_days,
            reps: fsrsCard.reps,
            lapses: fsrsCard.lapses,
            last_review: fsrsCard.last_review ? fsrsCard.last_review.toISOString() : undefined
          } : undefined
        };
      });
    
    console.log('IrysService: Formatted questions count:', formattedQuestions.length);
    return formattedQuestions;
  }
}

// Export a singleton instance
export const irysService = new IrysService();
export default irysService; 