
export enum SupportedLanguage {
  ENGLISH = 'English',
  CHINESE_SIMPLIFIED = 'Chinese (Simplified)',
  CHINESE_TRADITIONAL = 'Chinese (Traditional)',
  SPANISH = 'Spanish',
  FRENCH = 'French',
  GERMAN = 'German',
  JAPANESE = 'Japanese',
  KOREAN = 'Korean',
  RUSSIAN = 'Russian',
  PORTUGUESE = 'Portuguese',
  ITALIAN = 'Italian',
  ARABIC = 'Arabic',
  HINDI = 'Hindi',
  INDONESIAN = 'Indonesian',
  DUTCH = 'Dutch',
  TURKISH = 'Turkish'
}

export interface AudioFileState {
  file: File | null;
  base64: string | null;
  mimeType: string | null;
  duration: number | null;
}

export interface TranscriptionState {
  text: string;
  isTranscribing: boolean;
  isRecording: boolean;
  progress: number; // 0-100
  error: string | null;
}

export interface TranslationState {
  translations: Record<string, string>; // language -> translated text
  summaries: Record<string, string>; // language -> summary text
  isTranslating: boolean;
  isSummarizing: boolean;
  progress: number; // 0-100
  error: string | null;
}

export interface ArchiveRecord {
  id: string;
  fileName: string;
  fileSize: number;
  lastModified: number;
  mimeType: string | null;
  transcription: string;
  translations: Record<string, string>;
  summaries?: Record<string, string>;
  createdAt: number;
  isLiveRecording?: boolean;
}
