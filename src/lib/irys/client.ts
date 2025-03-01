import { QuestionWithResponse } from '../../types/song';
import { ethers } from 'ethers';
import { WebUploader } from "@irys/web-upload";
import { WebEthereum } from "@irys/web-upload-ethereum";
import { EthersV6Adapter } from "@irys/web-upload-ethereum-ethers-v6";

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
      // Create ethers provider
      const ethersProvider = new ethers.BrowserProvider(provider);
      console.log('IrysService: Created ethers provider');

      // Get signer
      const signer = await ethersProvider.getSigner();
      console.log('IrysService: Got signer');

      // Initialize Irys with Ethers v6 adapter
      console.log('IrysService: Initializing Irys with Ethers v6 adapter...');
      
      try {
        // Use WebUploader as a function (not a constructor)
        this.webIrys = await WebUploader(WebEthereum)
          .withAdapter(EthersV6Adapter(ethersProvider))
          .devnet()
          .build();
        
        // Log the connected address
        const address = await signer.getAddress();
        console.log('IrysService: Connected with address:', address);

        // Ensure the client is ready
        await this.webIrys.ready();
        console.log('IrysService: Irys client is ready');
      } catch (initError) {
        console.error('IrysService: Error during WebUploader initialization:', initError);
        throw new Error(`Failed to initialize WebUploader: ${initError instanceof Error ? initError.message : String(initError)}`);
      }
    } catch (error) {
      console.error('IrysService: Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Save user progress to Irys
   */
  async saveProgress(progress: UserProgress): Promise<string> {
    if (!this.isInitialized || !this.webIrys) {
      throw new Error('IrysService not initialized. Call init() first.');
    }

    console.log('IrysService: Saving progress to Irys:', progress);

    // Prepare data for upload
    const data = JSON.stringify(progress);

    // Check upload size limit (100KB = 100 * 1024 bytes)
    const size = new Blob([data]).size;
    if (size > 100 * 1024) {
      throw new Error(`Upload size (${size} bytes) exceeds maximum limit of 100KB`);
    }

    // Add metadata tags
    const tags = [
      { name: "Content-Type", value: "application/json" },
      { name: "App-Name", value: "Scarlett-Tutor" },
      { name: "Type", value: "user-progress" },
      { name: "User-Id", value: progress.userId },
      { name: "Song-Id", value: progress.songId },
      { name: "Completed-At", value: progress.completedAt.toString() }
    ];

    try {
      // Upload the data with tags
      const receipt = await this.webIrys.upload(data, { tags });
      console.log('IrysService: Upload successful:', receipt);
      return receipt.id;
    } catch (error) {
      console.error('IrysService: Upload failed:', error);
      throw new Error(`Failed to upload to Irys: ${error instanceof Error ? error.message : String(error)}`);
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
      
      // Execute the query against the Irys GraphQL endpoint (use devnet for Base Sepolia)
      const response = await fetch('https://devnet.irys.xyz/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      
      // Check if we have any transactions
      if (!result.data?.transactions?.edges?.length) {
        console.log(`IrysService: No progress found for userId=${userId}, songId=${songId}`);
        return null;
      }
      
      // Get the transaction ID
      const txId = result.data.transactions.edges[0].node.id;
      console.log(`IrysService: Found transaction with ID: ${txId}`);
      
      // Fetch the transaction data
      const dataResponse = await fetch(`https://devnet.irys.xyz/tx/${txId}/data`, {
        method: 'GET',
      });
      
      if (!dataResponse.ok) {
        throw new Error(`Failed to fetch transaction data: ${dataResponse.status} ${dataResponse.statusText}`);
      }
      
      // Parse the JSON data
      const progressData = await dataResponse.json();
      console.log(`IrysService: Retrieved progress data:`, progressData);
      
      return progressData as UserProgress;
    } catch (error) {
      console.error('IrysService: Failed to get latest progress:', error);
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
      const response = await fetch('https://devnet.irys.xyz/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });
      
      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.status} ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }
      
      // Check if we have any transactions
      if (!result.data?.transactions?.edges?.length) {
        console.log(`IrysService: No progress found for userId=${userId}`);
        return [];
      }
      
      // Get all transaction IDs
      const txIds = result.data.transactions.edges.map((edge: any) => edge.node.id);
      console.log(`IrysService: Found ${txIds.length} transactions`);
      
      // Fetch all transaction data in parallel
      const progressEntries = await Promise.all(
        txIds.map(async (txId: string) => {
          try {
            const dataResponse = await fetch(`https://devnet.irys.xyz/tx/${txId}/data`, {
              method: 'GET',
            });
            
            if (!dataResponse.ok) {
              console.error(`Failed to fetch transaction data for ${txId}: ${dataResponse.status} ${dataResponse.statusText}`);
              return null;
            }
            
            return await dataResponse.json() as UserProgress;
          } catch (error) {
            console.error(`Error fetching data for transaction ${txId}:`, error);
            return null;
          }
        })
      );
      
      // Filter out any failed fetches
      const validEntries = progressEntries.filter((entry): entry is UserProgress => entry !== null);
      console.log(`IrysService: Retrieved ${validEntries.length} valid progress entries`);
      
      return validEntries;
    } catch (error) {
      console.error('IrysService: Failed to get all user progress:', error);
      return [];
    }
  }

  /**
   * Format questions for progress storage
   */
  formatQuestionsForProgress(
    questions: QuestionWithResponse[],
    fsrsCards?: Map<string, any>
  ): UserProgress['questions'] {
    return questions.map(q => {
      const formattedQuestion: UserProgress['questions'][0] = {
        uuid: q.uuid,
        selectedAnswer: q.userAnswer || '',
        isCorrect: q.isCorrect || false,
      };
      
      // Add FSRS data if available
      if (fsrsCards && fsrsCards.has(q.uuid)) {
        formattedQuestion.fsrs = fsrsCards.get(q.uuid);
      }
      
      return formattedQuestion;
    });
  }
}

// Export a singleton instance
export const irysService = new IrysService();
export default irysService; 