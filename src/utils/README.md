# FSRS Debugging Tools

This directory contains utilities for debugging and logging FSRS (Free Spaced Repetition System) data in the Scarlett Tutor application.

## Overview

The FSRS debugging tools help visualize and analyze spaced repetition data stored in Irys. These tools are useful for:

1. Understanding which questions should be shown to users based on their learning history
2. Analyzing user progress and performance
3. Debugging issues with the spaced repetition algorithm
4. Monitoring the effectiveness of the learning system

## Available Tools

### 1. FSRS Debugger Utility (`fsrsDebugger.ts`)

This utility provides functions to debug and log FSRS data from Irys:

- `logFsrsProgress(userId, songId)`: Logs FSRS progress data for a specific user and song
- `logAllUserProgress(userId)`: Gets all progress entries for a user from Irys and logs them
- `logIrysData(userId, songId)`: Logs raw Irys data for a specific user and song directly to the console

### 2. FSRS Debug Panel Component (`components/debug/FsrsDebugPanel.tsx`)

A React component that provides a UI for viewing FSRS debug data:

- Shows statistics about questions (total, due, average stability, etc.)
- Displays questions by state (new, learning, review, relearning)
- Lists the next due questions
- Shows sample questions with their FSRS data
- Provides a button to log raw Irys data directly to the console

### 3. FSRS Debug API (`api/fsrsDebug.ts`)

API endpoints for retrieving FSRS debug data:

- `getFsrsDebugData(userId, songId)`: Gets FSRS debug data for a specific user and song
- `getAllUserProgress(userId)`: Gets all progress entries for a user
- `getRawIrysData(userId, songId)`: Gets raw Irys data for a specific user and song

## Usage

### In the Study Page

The FSRS Debug Panel is integrated into the Study Page. To access it:

1. Navigate to a song's study page
2. Click the "Debug" button in the top-right corner
3. The debug panel will appear, showing FSRS data for the current user and song
4. Click "Log Raw Irys Data" to log the raw data directly to the console for deeper inspection

### In Code

```typescript
import { logFsrsProgress, logAllUserProgress, logIrysData } from '../utils/fsrsDebugger';

// Log FSRS progress for a specific user and song
const progress = await logFsrsProgress(userId, songId);
console.log(progress);

// Log all progress entries for a user
const allProgress = await logAllUserProgress(userId);
console.log(allProgress);

// Log raw Irys data for a specific user and song
const rawData = await logIrysData(userId, songId);
console.log(rawData);
```

### API Usage

```typescript
import { getFsrsDebugData, getAllUserProgress, getRawIrysData } from '../api/fsrsDebug';

// Get FSRS debug data for a specific user and song
const debugData = await getFsrsDebugData(userId, songId);
console.log(debugData);

// Get all progress entries for a user
const allProgress = await getAllUserProgress(userId);
console.log(allProgress);

// Get raw Irys data for a specific user and song
const rawData = await getRawIrysData(userId, songId);
console.log(rawData);
```

## Data Structure

The FSRS data structure follows the format defined in the `ts-fsrs` library:

```typescript
interface Card {
  due: Date;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: number; // 0=new, 1=learning, 2=review, 3=relearning
  last_review?: Date;
}
```

## Troubleshooting

If you encounter issues with the FSRS debugging tools:

1. Check that the user is connected with a wallet
2. Verify that the user has completed at least one study session
3. Ensure that Irys is properly configured and accessible
4. Check the browser console for error messages
5. Use the "Log Raw Irys Data" button to inspect the raw data stored in Irys
6. Compare the raw data with the processed FSRS data to identify any discrepancies 