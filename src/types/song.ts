export interface Song {
  id: number;
  song_title: string;
  song_title_translated: string;
  artist_name: string;
  song_duration: number;
  audio_cid: string;
  lyrics_cid: string;
  cover_img_cid: string;
  thumb_img_cid: string;
  questions_cid_1: string; // English questions
  questions_cid_2: string; // Chinese questions
  language_1: string; // Primary language (e.g., 'en')
  language_2: string; // Secondary language (e.g., 'zh')
  cefr_level: number;
  unique_words_1: number;
  unique_words_2: number;
  words_per_second: number;
  rating: string;
  spotify_id?: string | null;
  apple_id?: string | null;
  youtube_id?: string | null;
  deezer_id?: string | null;
  tidal_id?: string | null;
  genius_id?: string | null;
  odyssey_id?: string | null;
}

export interface Question {
  uuid: string;
  question: string;
  options: {
    a: string;
    b: string;
    c: string;
    d: string;
  };
  audio_cid: string;
}

export interface QuestionResponse {
  uuid: string;
  answer: 'a' | 'b' | 'c' | 'd';
  explanation: string;
  audio_cid: string;
}

export interface QuestionWithResponse extends Question {
  userAnswer?: 'a' | 'b' | 'c' | 'd';
  isCorrect?: boolean;
  response?: QuestionResponse;
} 