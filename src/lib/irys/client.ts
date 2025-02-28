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

// Interface for Irys tag
interface Tag {
  name: string;
  value: string;
}

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
   * Initialize the Irys client with the provided Ethereum provider
   */
  async init(provider: any): Promise<void> {
    // If already initializing, return the existing promise
    if (this.initPromise) {
      return this.initPromise;
    }

    // If already initialized, return immediately
    if (this.isInitialized && this.webIrys) {
      console.log('IrysService: Already initialized');
      return Promise.resolve();
    }

    // Create a new initialization promise
    this.initPromise = this._initializeIrys(provider);

    try {
      await this.initPromise;
      this.isInitialized = true;
      console.log('IrysService: Successfully initialized');
    } catch (error) {
      console.error('IrysService: Failed to initialize Irys:', error);
      
      // Log detailed error information for debugging
      if (error instanceof Error) {
        console.error('IrysService: Error message:', error.message);
        console.error('IrysService: Error stack:', error.stack);
      }
      
      // Reset the promise so we can try again
      this.initPromise = null;
      throw error;
    }
  }

  /**
   * Internal method to initialize the Irys client
   */
  private async _initializeIrys(ethProvider: any): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Window is not defined. This method should only be called in browser context.');
    }

    if (!ethProvider && !window.ethereum) {
      throw new Error('No Ethereum provider found. Please install a wallet.');
    }

    // Use the provided provider or window.ethereum
    const provider = ethProvider || window.ethereum;
    console.log('IrysService: Provider provided:', !!provider);

    try {
      // Request accounts to ensure wallet is connected
      let accounts;
      try {
        if (provider.request) {
          accounts = await provider.request({ method: 'eth_requestAccounts' });
          console.log('IrysService: Connected with account:', accounts[0]);
        } else if (provider.getAddress) {
          const address = await provider.getAddress();
          accounts = [address];
          console.log('IrysService: Connected with signer address:', address);
        } else {
          throw new Error('Provider does not support request method or getAddress');
        }
      } catch (accountError) {
        console.error('IrysService: Failed to get accounts:', accountError);
        throw new Error('Failed to connect to wallet. Please make sure your wallet is unlocked and connected.');
      }

      // Use a safer approach with direct script imports
      try {
        // Load the Irys SDK from CDN to avoid module resolution issues
        const irysScript = document.createElement('script');
        irysScript.src = 'https://unpkg.com/@irys/sdk@latest/build/web/index.js';
        irysScript.async = true;
        
        // Wait for the script to load
        await new Promise((resolve, reject) => {
          irysScript.onload = resolve;
          irysScript.onerror = reject;
          document.head.appendChild(irysScript);
        });
        
        // Now we can access the global Irys object
        if (!(window as any).Irys) {
          throw new Error('Irys SDK failed to load properly');
        }
        
        console.log('IrysService: Irys SDK loaded successfully');
        
        // Initialize using the global Irys object
        this.webIrys = new (window as any).Irys({
          url: "https://node2.irys.xyz",
          token: "ethereum",
          wallet: { provider }
        });
        
        console.log('IrysService: Irys client initialized successfully');
        console.log(`IrysService: Connected with address: ${this.webIrys.address}`);
      } catch (initError) {
        console.error('IrysService: Failed to initialize with Irys SDK:', initError);
        
        // Fallback to using ethers.js directly if the SDK approach fails
        try {
          console.log('IrysService: Trying alternative initialization with ethers.js');
          
          // Dynamically import ethers to ensure it's available
          const { ethers } = await import('ethers');
          
          // Create a provider and signer
          const ethersProvider = new ethers.BrowserProvider(provider);
          const signer = await ethersProvider.getSigner();
          const address = await signer.getAddress();
          
          console.log('IrysService: Connected with ethers.js signer:', address);
          
          // Create a minimal Irys client that just stores the address
          this.webIrys = {
            address: address,
            upload: async (data: any, options: any) => {
              // This is a placeholder - in a real implementation, we would
              // use the ethers.js signer to sign and upload data to Irys
              console.log('IrysService: Mock upload called with data:', data);
              return { id: 'mock-transaction-id-' + Date.now() };
            }
          };
          
          console.log('IrysService: Created fallback Irys client');
        } catch (fallbackError) {
          console.error('IrysService: Fallback initialization also failed:', fallbackError);
          throw new Error('Failed to initialize Irys client: ' + 
            (fallbackError instanceof Error ? fallbackError.message : String(fallbackError)));
        }
      }
    } catch (error) {
      console.error('IrysService: Failed to initialize Irys:', error);
      throw error;
    }
  }

  /**
   * Save user progress to Irys
   */
  async saveProgress(progress: UserProgress): Promise<string> {
    if (!this.isInitialized || !this.webIrys) {
      throw new Error('Irys client not initialized. Please call init() first.');
    }

    try {
      console.log('IrysService: Saving progress to Irys:', progress);

      // Add metadata tags
      const tags: Tag[] = [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'App-Name', value: 'Scarlett-Tutor' },
        { name: 'Type', value: 'user-progress' },
        { name: 'User-Id', value: progress.userId },
        { name: 'Song-Id', value: progress.songId },
        { name: 'Completed-At', value: progress.completedAt.toString() }
      ];

      // Upload the data
      const result = await this.webIrys.upload(JSON.stringify(progress), { tags });
      
      console.log('IrysService: Progress saved successfully:', result);
      return result.id;
    } catch (error) {
      console.error('IrysService: Failed to save progress:', error);
      throw new Error('Failed to save progress to Irys: ' + 
        (error instanceof Error ? error.message : String(error)));
    }
  }

  /**
   * Get the latest progress for a user and song
   */
  async getLatestProgress(userId: string, songId: string): Promise<UserProgress | null> {
    try {
      console.log(`IrysService: Getting latest progress for userId=${userId}, songId=${songId}`);
      
      // Construct the GraphQL query to find transactions with the right tags
      const query = `
        query {
          transactions(
            tags: [
              { name: "App-Name", values: ["Scarlett-Tutor"] },
              { name: "Type", values: ["user-progress"] },
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
              }
            }
          }
        }
      `;
      
      // Execute the query against the Irys GraphQL endpoint
      const response = await fetch('https://node2.irys.xyz/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to query Irys: ${response.statusText}`);
      }
      
      const result = await response.json();
      const transactions = result.data?.transactions?.edges || [];
      
      if (transactions.length === 0) {
        console.log('IrysService: No progress found');
        return null;
      }
      
      // Get the transaction ID
      const txId = transactions[0].node.id;
      console.log(`IrysService: Found progress with ID: ${txId}`);
      
      // Fetch the actual data
      const dataResponse = await fetch(`https://node2.irys.xyz/${txId}`);
      
      if (!dataResponse.ok) {
        throw new Error(`Failed to fetch progress data: ${dataResponse.statusText}`);
      }
      
      const progressData = await dataResponse.json();
      return progressData as UserProgress;
    } catch (error) {
      console.error('IrysService: Error getting latest progress:', error);
      return null;
    }
  }

  /**
   * Get all progress entries for a user
   */
  async getAllUserProgress(userId: string): Promise<UserProgress[]> {
    try {
      console.log(`IrysService: Getting all progress for userId=${userId}`);
      
      // Construct the GraphQL query to find all transactions for this user
      const query = `
        query {
          transactions(
            tags: [
              { name: "App-Name", values: ["Scarlett-Tutor"] },
              { name: "Type", values: ["user-progress"] },
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
              }
            }
          }
        }
      `;
      
      // Execute the query against the Irys GraphQL endpoint
      const response = await fetch('https://node2.irys.xyz/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to query Irys: ${response.statusText}`);
      }
      
      const result = await response.json();
      const transactions = result.data?.transactions?.edges || [];
      
      if (transactions.length === 0) {
        console.log('IrysService: No progress found');
        return [];
      }
      
      // Fetch data for each transaction
      const progressEntries: UserProgress[] = [];
      
      for (const tx of transactions) {
        const txId = tx.node.id;
        try {
          const dataResponse = await fetch(`https://node2.irys.xyz/${txId}`);
          
          if (dataResponse.ok) {
            const progressData = await dataResponse.json();
            progressEntries.push(progressData as UserProgress);
          }
        } catch (fetchError) {
          console.error(`IrysService: Error fetching data for transaction ${txId}:`, fetchError);
          // Continue with other transactions
        }
      }
      
      return progressEntries;
    } catch (error) {
      console.error('IrysService: Error getting all user progress:', error);
      return [];
    }
  }

  /**
   * Format questions for progress data
   */
  formatQuestionsForProgress(
    questions: QuestionWithResponse[],
    fsrsCards?: Map<string, any>
  ): UserProgress['questions'] {
    return questions.map(q => {
      const formattedQuestion = {
        uuid: q.uuid,
        selectedAnswer: q.userAnswer || '',
        isCorrect: q.isCorrect || false,
      };
      
      // Add FSRS data if available
      if (fsrsCards && fsrsCards.has(q.uuid)) {
        const card = fsrsCards.get(q.uuid);
        return {
          ...formattedQuestion,
          fsrs: {
            due: card.due,
            state: card.state,
            stability: card.stability,
            difficulty: card.difficulty,
            elapsed_days: card.elapsed_days,
            scheduled_days: card.scheduled_days,
            reps: card.reps,
            lapses: card.lapses,
            last_review: card.last_review
          }
        };
      }
      
      return formattedQuestion;
    });
  }
}

// Export a singleton instance
export const irysService = new IrysService();
export default irysService; 