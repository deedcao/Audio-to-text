import React, { useState, useRef, useEffect } from 'react';
import { 
  SupportedLanguage, 
  AudioFileState, 
  TranscriptionState, 
  TranslationState,
  ArchiveRecord
} from './types';
import { transcribeAudio, translateText, generateSummary } from './services/geminiService';
import { processLargeAudioFile } from './services/audioUtils';
import { 
  saveRecord, 
  getArchive, 
  findRecordForFile, 
  deleteRecord 
} from './services/storageService';
import { AudioUploader } from './components/AudioUploader';
import { ResultCard } from './components/ResultCard';
import { HistoryModal } from './components/HistoryModal';
import { ProgressBar } from './components/ProgressBar';
import { 
  PlayCircle, 
  PauseCircle, 
  X, 
  Languages, 
  ArrowRight,
  FileAudio,
  History,
  Archive,
  FileText,
  ListTodo
} from './components/Icons';

type RightPanelMode = 'translation' | 'summary';

function App() {
  // --- State Management ---
  const [audioState, setAudioState] = useState<AudioFileState>({
    file: null,
    base64: null,
    mimeType: null,
    duration: null
  });

  // Used to track if we are viewing a history item (which has no File object)
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [historyFileName, setHistoryFileName] = useState<string | null>(null);

  const [transcription, setTranscription] = useState<TranscriptionState>({
    text: '',
    isTranscribing: false,
    progress: 0,
    error: null
  });

  const [translation, setTranslation] = useState<TranslationState>({
    translations: {},
    summaries: {},
    isTranslating: false,
    isSummarizing: false,
    progress: 0,
    error: null
  });

  const [selectedTargetLang, setSelectedTargetLang] = useState<SupportedLanguage>(SupportedLanguage.CHINESE_SIMPLIFIED);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>('translation');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressInterval = useRef<number | null>(null);

  // --- Persistence Helper ---
  const persistCurrentState = (
    newTranscriptionText?: string, 
    newTranslations?: Record<string, string>,
    newSummaries?: Record<string, string>
  ) => {
    // We need either a current file OR an active record ID to save
    if (!audioState.file && !activeRecordId) return;

    const baseRecord: Partial<ArchiveRecord> = {
      transcription: newTranscriptionText ?? transcription.text,
      translations: newTranslations ?? translation.translations,
      summaries: newSummaries ?? translation.summaries,
      createdAt: Date.now()
    };

    if (audioState.file) {
      // Create new record from file
      const record: ArchiveRecord = {
        id: `${audioState.file.name}-${audioState.file.size}-${audioState.file.lastModified}`,
        fileName: audioState.file.name,
        fileSize: audioState.file.size,
        lastModified: audioState.file.lastModified,
        mimeType: audioState.mimeType,
        ...baseRecord
      } as ArchiveRecord;
      saveRecord(record);
      setActiveRecordId(record.id);
    } else if (activeRecordId && historyFileName) {
      // Update existing history record (loaded from archive)
      const existing = getArchive().find(r => r.id === activeRecordId);
      if (existing) {
        saveRecord({
          ...existing,
          ...baseRecord
        } as ArchiveRecord);
      }
    }
  };

  // --- Helpers ---
  
  const startSimulatedProgress = (setFn: React.Dispatch<React.SetStateAction<any>>, max = 90) => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    
    setFn((prev: any) => ({ ...prev, progress: 0 }));
    
    progressInterval.current = window.setInterval(() => {
      setFn((prev: any) => {
        if (prev.progress >= max) return prev;
        // Slow down as we get closer to 90%
        const increment = Math.max(0.5, (max - prev.progress) / 20); 
        return { ...prev, progress: Math.min(max, prev.progress + increment) };
      });
    }, 200);
  };

  const stopSimulatedProgress = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current);
      progressInterval.current = null;
    }
  };

  // --- Handlers ---

  const handleFileSelect = (file: File) => {
    // Reset states when new file is selected
    setTranscription({ text: '', isTranscribing: false, progress: 0, error: null });
    setTranslation({ translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null });
    setActiveRecordId(null);
    setHistoryFileName(null);
    setRightPanelMode('translation');
    stopSimulatedProgress();
    
    // Check archive for existing work
    const existingRecord = findRecordForFile(file);
    if (existingRecord) {
      // Auto-restore
      setTranscription({
        text: existingRecord.transcription,
        isTranscribing: false,
        progress: 100,
        error: null
      });
      setTranslation({
        translations: existingRecord.translations,
        summaries: existingRecord.summaries || {},
        isTranslating: false,
        isSummarizing: false,
        progress: 100,
        error: null
      });
      setActiveRecordId(existingRecord.id);
      // We don't return here, we still load the audio so it can be played!
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const base64Data = result.split(',')[1];
      
      let mimeType = file.type;
      const extension = file.name.split('.').pop()?.toLowerCase();

      if (extension === 'm4a' || extension === 'mp4') {
        mimeType = 'audio/mp4';
      } else if (extension === 'mp3') {
        mimeType = 'audio/mp3';
      } else if (extension === 'wav') {
        mimeType = 'audio/wav';
      }

      setAudioState({
        file,
        base64: base64Data,
        mimeType: mimeType,
        duration: 0 
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveFile = () => {
    setAudioState({ file: null, base64: null, mimeType: null, duration: null });
    setTranscription({ text: '', isTranscribing: false, progress: 0, error: null });
    setTranslation({ translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null });
    setActiveRecordId(null);
    setHistoryFileName(null);
    setIsPlaying(false);
    stopSimulatedProgress();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const handleLoadFromHistory = (record: ArchiveRecord) => {
    setAudioState({ file: null, base64: null, mimeType: null, duration: null });
    setTranscription({
      text: record.transcription,
      isTranscribing: false,
      progress: 100,
      error: null
    });
    setTranslation({
      translations: record.translations,
      summaries: record.summaries || {},
      isTranslating: false,
      isSummarizing: false,
      progress: 100,
      error: null
    });
    setActiveRecordId(record.id);
    setHistoryFileName(record.fileName);
    setIsHistoryOpen(false);
    setRightPanelMode('translation');
  };

  const handleDeleteHistory = (id: string) => {
    deleteRecord(id);
    if (activeRecordId === id) {
      handleRemoveFile();
    }
  };

  const togglePlayback = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTranscribe = async () => {
    if (!audioState.file || !audioState.base64) return;

    setTranscription(prev => ({ ...prev, isTranscribing: true, error: null, progress: 1 }));
    
    // LARGE FILE HANDLING STRATEGY
    // The Gemini inline API limit is ~20MB.
    // If file > 18MB, we use the client-side chunking strategy.
    const isLargeFile = audioState.file.size > 18 * 1024 * 1024;

    try {
      let finalText = "";

      if (isLargeFile) {
        // --- CHUNKING PATH ---
        setTranscription(prev => ({ ...prev, progress: 5 })); // 5% = processing start
        
        // 1. Process & Split (This can take a moment for large files)
        const chunks = await processLargeAudioFile(audioState.file);
        
        // 2. Iterate and Transcribe
        for (let i = 0; i < chunks.length; i++) {
          const chunkBase64 = chunks[i];
          const chunkProgress = 10 + Math.round((i / chunks.length) * 80);
          setTranscription(prev => ({ ...prev, progress: chunkProgress }));

          // For chunks, we ask for CONTINUATION if it's not the first one
          const chunkText = await transcribeAudio(chunkBase64, 'audio/wav');
          
          if (finalText) {
             finalText += "\n\n" + chunkText;
          } else {
             finalText = chunkText;
          }
        }
      } else {
        // --- STANDARD PATH ---
        startSimulatedProgress(setTranscription, 90);
        finalText = await transcribeAudio(audioState.base64, audioState.mimeType || 'audio/mp3');
      }
      
      stopSimulatedProgress();
      setTranscription({ text: finalText, isTranscribing: false, error: null, progress: 100 });
      persistCurrentState(finalText, undefined, undefined);

    } catch (err: any) {
      stopSimulatedProgress();
      console.error(err);
      setTranscription({ 
        text: '', 
        isTranscribing: false, 
        progress: 0,
        error: err.message || 'An unexpected error occurred during transcription.' 
      });
    }
  };

  const handleTranslate = async () => {
    if (!transcription.text) return;
    
    // Switch to translation view if likely desired
    setRightPanelMode('translation');

    if (translation.translations[selectedTargetLang]) return;

    setTranslation(prev => ({ ...prev, isTranslating: true, error: null, progress: 0 }));

    try {
      const translatedText = await translateText(
        transcription.text, 
        selectedTargetLang, 
        (percent) => {
           setTranslation(prev => ({ ...prev, progress: percent }));
        }
      );
      
      const newTranslations = {
        ...translation.translations,
        [selectedTargetLang]: translatedText
      };
      
      setTranslation(prev => ({
        ...prev,
        translations: newTranslations,
        isTranslating: false,
        progress: 100
      }));

      persistCurrentState(undefined, newTranslations, undefined);

    } catch (err: any) {
      console.error(err);
      setTranslation(prev => ({ 
        ...prev, 
        isTranslating: false, 
        progress: 0,
        error: err.message || 'Translation failed.' 
      }));
    }
  };

  const handleGenerateSummary = async () => {
    const sourceText = translation.translations[selectedTargetLang] || transcription.text;
    if (!sourceText) return;
    
    if (translation.summaries[selectedTargetLang]) return;

    setTranslation(prev => ({ ...prev, isSummarizing: true, error: null }));

    try {
      const summaryText = await generateSummary(sourceText, selectedTargetLang);
      const newSummaries = {
        ...translation.summaries,
        [selectedTargetLang]: summaryText
      };

      setTranslation(prev => ({
        ...prev,
        summaries: newSummaries,
        isSummarizing: false
      }));
      
      persistCurrentState(undefined, undefined, newSummaries);

    } catch (err: any) {
      console.error(err);
      setTranslation(prev => ({ 
        ...prev, 
        isSummarizing: false, 
        error: err.message || 'Summary generation failed.' 
      }));
    }
  };

  // --- Effects ---
  useEffect(() => {
    if (audioState.file && audioRef.current) {
      audioRef.current.src = URL.createObjectURL(audioState.file);
      audioRef.current.onended = () => setIsPlaying(false);
    }
    return () => stopSimulatedProgress();
  }, [audioState.file]);

  // --- UI Components ---

  const renderFilePreview = () => (
    <div className="mb-8 flex items-center justify-between rounded-xl border border-indigo-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
          <FileAudio className="h-6 w-6" />
        </div>
        <div>
          <h3 className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-md">
            {audioState.file?.name || historyFileName}
          </h3>
          <p className="text-xs text-slate-500">
            {audioState.file 
              ? `${(audioState.file.size / (1024 * 1024)).toFixed(2)} MB • ${audioState.mimeType}`
              : 'Archived File (Audio not available)'}
          </p>
        </div>
      </div>
      
      <div className="flex items-center gap-3">
        {audioState.file && (
          <button 
            onClick={togglePlayback}
            className="flex h-10 w-10 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 transition-colors"
          >
            {isPlaying ? <PauseCircle className="h-8 w-8" /> : <PlayCircle className="h-8 w-8" />}
          </button>
        )}
        <button 
          onClick={handleRemoveFile}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          title="Clear / Start New"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <audio ref={audioRef} className="hidden" />
    </div>
  );

  // Determine if we are in "Result Mode" (either have text OR have a file)
  const hasContent = transcription.text || transcription.isTranscribing || transcription.error || audioState.file || historyFileName;
  // If we have history loaded (no file) but text is present, show results
  const showResults = transcription.text || transcription.isTranscribing || transcription.error;

  const currentTranslation = translation.translations[selectedTargetLang];
  const currentSummary = translation.summaries[selectedTargetLang];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <HistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)}
        history={getArchive()} 
        onSelect={handleLoadFromHistory}
        onDelete={handleDeleteHistory}
      />

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2" onClick={handleRemoveFile} role="button">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
              <Languages className="h-5 w-5" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900">AudioGlot AI</span>
          </div>
          
          <div className="flex items-center gap-4">
             <button
              onClick={() => setIsHistoryOpen(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-indigo-600 transition-colors"
            >
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">History</span>
            </button>
            <div className="text-sm text-slate-500 font-medium hidden sm:block">Powered by Gemini 2.5</div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Intro Section - Hide when content exists */}
        {!hasContent && (
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Transcribe & Translate Audio
            </h1>
            <p className="mx-auto max-w-2xl text-lg text-slate-600">
              Upload your recordings and let AI instantly turn speech into text, available in over 15 languages.
            </p>
          </div>
        )}

        {/* Upload Section */}
        <div className="mx-auto max-w-3xl mb-12">
          {!hasContent ? (
             <AudioUploader onFileSelect={handleFileSelect} />
          ) : (
             renderFilePreview()
          )}
        </div>

        {/* Action Area (Transcribe Button or Progress) */}
        {audioState.file && !transcription.text && !transcription.isTranscribing && (
          <div className="flex justify-center mb-12">
            <button
              onClick={handleTranscribe}
              className="group flex items-center gap-2 rounded-full bg-indigo-600 px-8 py-4 text-lg font-semibold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-700 hover:shadow-xl hover:-translate-y-0.5"
            >
              Start Transcription
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        )}
        
        {/* Active Transcription Progress (if happening outside of result card, e.g. starting) */}
        {transcription.isTranscribing && !transcription.text && (
           <div className="mx-auto max-w-md mb-12">
             <ProgressBar 
               progress={transcription.progress} 
               label={audioState.file && audioState.file.size > 18 * 1024 * 1024 ? "Processing Large File (Decoding & Chunking)..." : "Transcribing Audio..."} 
               color="bg-indigo-600" 
             />
           </div>
        )}

        {/* Restore Banner if loaded from history without file */}
        {historyFileName && !audioState.file && (
           <div className="mb-8 flex justify-center">
             <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-2 text-sm text-indigo-700">
               <Archive className="h-4 w-4" />
               Viewing archived content. Audio playback is unavailable.
             </div>
           </div>
        )}

        {/* Results Section */}
        {showResults && (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            
            {/* Left: Transcription */}
            <div className="h-[600px] flex flex-col">
              <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white p-4">
                 <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                   <FileAudio className="h-5 w-5 text-indigo-600" />
                   Original Transcription
                 </h3>
                 {transcription.text && !transcription.isTranscribing && (
                   <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                     Source
                   </span>
                 )}
              </div>
              
              <div className="flex-1 overflow-hidden">
                <ResultCard 
                  title="Transcription" 
                  content={transcription.text} 
                  isLoading={transcription.isTranscribing}
                  progress={transcription.progress}
                  language="Original Audio"
                  placeholder="Transcription in progress..."
                />
              </div>
              {transcription.error && (
                <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100">
                  {transcription.error}
                </div>
              )}
            </div>

            {/* Right: Translation & Summary */}
            <div className="h-[600px] flex flex-col">
              {/* Translation Controls */}
              <div className="mb-4 flex flex-col rounded-xl border border-slate-200 bg-white p-4 gap-4">
                
                {/* Top Row: Language and Action */}
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Target Language
                    </label>
                    <select
                      value={selectedTargetLang}
                      onChange={(e) => setSelectedTargetLang(e.target.value as SupportedLanguage)}
                      className="w-full rounded-lg border-slate-200 bg-slate-50 py-2 pl-3 pr-10 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-indigo-500"
                    >
                      {Object.values(SupportedLanguage).map((lang) => (
                        <option key={lang} value={lang}>{lang}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={handleTranslate}
                    disabled={!transcription.text || translation.isTranslating}
                    className="mt-auto h-10 rounded-lg bg-slate-900 px-6 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {translation.isTranslating ? 'Translating...' : 'Translate'}
                  </button>
                </div>

                {/* Bottom Row: View Switcher (Show if transcription exists) */}
                {transcription.text && (
                   <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
                     <button
                       onClick={() => setRightPanelMode('translation')}
                       className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${rightPanelMode === 'translation' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                     >
                       <Languages className="h-4 w-4" />
                       Translation
                     </button>
                     <button
                       onClick={() => setRightPanelMode('summary')}
                       className={`flex-1 flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors ${rightPanelMode === 'summary' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}
                     >
                       <ListTodo className="h-4 w-4" />
                       Summary / Minutes
                     </button>
                   </div>
                )}
              </div>

              {/* Panel Content */}
              <div className="flex-1 overflow-hidden relative">
                {rightPanelMode === 'translation' ? (
                  <ResultCard 
                    title="Translation" 
                    content={translation.translations[selectedTargetLang] || ''} 
                    isLoading={translation.isTranslating}
                    progress={translation.progress}
                    language={selectedTargetLang}
                    variant="secondary"
                    placeholder="Select a language and click Translate."
                  />
                ) : (
                  <div className="h-full flex flex-col">
                    {currentSummary ? (
                       <ResultCard 
                        title="Meeting Minutes" 
                        content={currentSummary} 
                        isLoading={translation.isSummarizing}
                        language={`${selectedTargetLang} Summary`}
                        variant="secondary"
                      />
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
                        <FileText className="mb-4 h-12 w-12 text-slate-300" />
                        <h3 className="mb-2 text-lg font-semibold text-slate-900">Generate Summary</h3>
                        <p className="mb-6 max-w-xs text-sm text-slate-500">
                          Create a structured summary and action items in {selectedTargetLang} based on the transcript or translation.
                        </p>
                        <button
                          onClick={handleGenerateSummary}
                          disabled={translation.isSummarizing}
                          className="rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-indigo-600 shadow-sm ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 disabled:opacity-50"
                        >
                          {translation.isSummarizing ? (
                             <span className="flex items-center gap-2">
                               <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
                               Generating...
                             </span>
                          ) : (
                            "Generate Minutes"
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {translation.error && (
                <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-600 border border-red-100">
                  {translation.error}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
