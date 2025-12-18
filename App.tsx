import React, { useState, useRef, useEffect } from 'react';
import { 
  SupportedLanguage, 
  AudioFileState, 
  TranscriptionState, 
  TranslationState, 
  ArchiveRecord
} from './types';
import { 
  transcribeAudio, 
  translateText, 
  generateSummary, 
  unifyTranscriptStyle,
  startLiveTranscription,
  encode
} from './services/geminiService';
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
  ListTodo,
  Mic,
  Square
} from './components/Icons';

type RightPanelMode = 'translation' | 'summary';

export default function App() {
  const [audioState, setAudioState] = useState<AudioFileState>({
    file: null,
    base64: null,
    mimeType: null,
    duration: null
  });

  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [historyFileName, setHistoryFileName] = useState<string | null>(null);

  const [transcription, setTranscription] = useState<TranscriptionState>({
    text: '',
    isTranscribing: false,
    isRecording: false,
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
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ArchiveRecord[]>([]);
  
  const liveSessionRef = useRef<any>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setHistory(getArchive());
  }, []);

  const handleFileSelect = async (file: File) => {
    const existing = findRecordForFile(file);
    if (existing) {
      loadRecord(existing);
      return;
    }

    setAudioState({ file, base64: null, mimeType: file.type, duration: null });
    setActiveRecordId(null);
    setHistoryFileName(null);
    setTranscription({ text: '', isTranscribing: true, isRecording: false, progress: 0, error: null });
    setTranslation({ translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null });

    try {
      const chunks = await processLargeAudioFile(file);
      let fullTranscript = "";
      for (let i = 0; i < chunks.length; i++) {
        const part = await transcribeAudio(chunks[i], 'audio/wav');
        fullTranscript += part + "\n";
        setTranscription(prev => ({ 
          ...prev, 
          text: fullTranscript,
          progress: Math.round(((i + 1) / chunks.length) * 100) 
        }));
      }

      const unified = await unifyTranscriptStyle(fullTranscript);
      setTranscription(prev => ({ ...prev, text: unified, isTranscribing: false, progress: 100 }));
      
      const record: ArchiveRecord = {
        id: `${file.name}-${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        lastModified: file.lastModified,
        mimeType: file.type,
        transcription: unified,
        translations: {},
        createdAt: Date.now()
      };
      saveRecord(record);
      setActiveRecordId(record.id);
      setHistory(getArchive());
    } catch (err: any) {
      setTranscription(prev => ({ ...prev, isTranscribing: false, error: err.message || "Transcription process failed" }));
    }
  };

  const loadRecord = (record: ArchiveRecord) => {
    setActiveRecordId(record.id);
    setHistoryFileName(record.fileName);
    setTranscription({ text: record.transcription, isTranscribing: false, isRecording: false, progress: 100, error: null });
    setTranslation({ translations: record.translations, summaries: record.summaries || {}, isTranslating: false, isSummarizing: false, progress: 100, error: null });
    setAudioState({ file: null, base64: null, mimeType: record.mimeType, duration: null });
  };

  const handleTranslate = async () => {
    if (!transcription.text || translation.isTranslating) return;
    setTranslation(prev => ({ ...prev, isTranslating: true, progress: 0, error: null }));
    try {
      const translated = await translateText(transcription.text, selectedTargetLang, (p) => {
        setTranslation(prev => ({ ...prev, progress: p }));
      });
      const newTranslations = { ...translation.translations, [selectedTargetLang]: translated };
      setTranslation(prev => ({ ...prev, translations: newTranslations, isTranslating: false, progress: 100 }));
      
      if (activeRecordId) {
        const archive = getArchive();
        const rec = archive.find(r => r.id === activeRecordId);
        if (rec) {
          rec.translations = newTranslations;
          saveRecord(rec);
          setHistory(getArchive());
        }
      }
    } catch (err: any) {
      setTranslation(prev => ({ ...prev, isTranslating: false, error: err.message || "Translation failed" }));
    }
  };

  const handleSummarize = async () => {
    if (!transcription.text || translation.isSummarizing) return;
    setTranslation(prev => ({ ...prev, isSummarizing: true, progress: 0, error: null }));
    try {
      const summary = await generateSummary(transcription.text, selectedTargetLang);
      const newSummaries = { ...translation.summaries, [selectedTargetLang]: summary };
      setTranslation(prev => ({ ...prev, summaries: newSummaries, isSummarizing: false, progress: 100 }));
      
      if (activeRecordId) {
        const archive = getArchive();
        const rec = archive.find(r => r.id === activeRecordId);
        if (rec) {
          rec.summaries = newSummaries;
          saveRecord(rec);
          setHistory(getArchive());
        }
      }
    } catch (err: any) {
      setTranslation(prev => ({ ...prev, isSummarizing: false, error: err.message || "Summary generation failed" }));
    }
  };

  const handleToggleLive = async () => {
    if (transcription.isRecording) {
      if (audioStreamRef.current) audioStreamRef.current.getTracks().forEach(t => t.stop());
      if (liveSessionRef.current) {
        const session = await liveSessionRef.current;
        session.close();
      }
      if (audioContextRef.current) await audioContextRef.current.close();
      
      setTranscription(prev => {
        if (prev.text.trim()) {
          const record: ArchiveRecord = {
            id: `live-${Date.now()}`,
            fileName: `Live Session ${new Date().toLocaleString()}`,
            fileSize: 0,
            lastModified: Date.now(),
            mimeType: 'audio/pcm',
            transcription: prev.text,
            translations: {},
            createdAt: Date.now(),
            isLiveRecording: true
          };
          saveRecord(record);
          setActiveRecordId(record.id);
          setHistory(getArchive());
        }
        return { ...prev, isRecording: false };
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      const ctx = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      
      const sessionPromise = startLiveTranscription({
        onTranscript: (text) => setTranscription(prev => ({ ...prev, text: prev.text + text })),
        onTurnComplete: () => setTranscription(prev => ({ ...prev, text: prev.text + '\n' })),
        onError: (err) => setTranscription(prev => ({ ...prev, error: "Connection error. Please try again.", isRecording: false })),
        onClose: () => setTranscription(prev => ({ ...prev, isRecording: false }))
      });
      
      liveSessionRef.current = sessionPromise;
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
        const pcmBlob = {
          data: encode(new Uint8Array(int16.buffer)),
          mimeType: 'audio/pcm;rate=16000',
        };
        sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
      };
      
      source.connect(processor);
      processor.connect(ctx.destination);
      
      setTranscription({ text: '', isTranscribing: false, isRecording: true, progress: 0, error: null });
      setActiveRecordId(null);
    } catch (err: any) {
      alert("Microphone access denied: " + err.message);
    }
  };

  const hasContent = transcription.text || transcription.isTranscribing || audioState.file || historyFileName || transcription.isRecording;

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-indigo-200 shadow-lg">
              <Languages className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">AudioGlot</h1>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">AI Meeting Intelligence</p>
            </div>
          </div>
          <button 
            onClick={() => setIsHistoryOpen(true)}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 hover:shadow-md"
          >
            <History className="h-4 w-4" />
            <span>History</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-6">
            <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Audio Input</h2>
              <AudioUploader onFileSelect={handleFileSelect} disabled={transcription.isTranscribing || transcription.isRecording} />
              
              <div className="mt-6 flex flex-col gap-3">
                <button
                  onClick={handleToggleLive}
                  disabled={transcription.isTranscribing}
                  className={`flex w-full items-center justify-center gap-3 rounded-xl py-3 text-sm font-bold transition-all ${
                    transcription.isRecording ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg'
                  }`}
                >
                  {transcription.isRecording ? <><Square className="h-4 w-4 fill-current" /> Stop Live Session</> : <><Mic className="h-4 w-4" /> Record Live Meeting</>}
                </button>
                
                {(audioState.file || historyFileName) && !transcription.isRecording && (
                  <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 border border-slate-100">
                    <FileAudio className="h-5 w-5 text-indigo-500" />
                    <span className="text-xs font-medium text-slate-600 truncate">{audioState.file?.name || historyFileName}</span>
                    <button onClick={() => { setAudioState({file:null,base64:null,mimeType:null,duration:null}); setTranscription({text:'',isTranscribing:false,isRecording:false,progress:0,error:null}); setTranslation({translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null}); }} className="ml-auto text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                  </div>
                )}
              </div>
            </div>

            {hasContent && (
              <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-100">
                <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-400">Processing Options</h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-xs font-semibold text-slate-700">Target Translation Language</label>
                    <select value={selectedTargetLang} onChange={(e) => setSelectedTargetLang(e.target.value as SupportedLanguage)} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm focus:border-indigo-500">
                      {Object.values(SupportedLanguage).map(lang => <option key={lang} value={lang}>{lang}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={() => setRightPanelMode('translation')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${rightPanelMode === 'translation' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-white text-slate-600 border border-slate-100'}`}>
                      <FileText className="h-3.5 w-3.5" /> Translation
                    </button>
                    <button onClick={() => setRightPanelMode('summary')} className={`flex-1 flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${rightPanelMode === 'summary' ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-white text-slate-600 border border-slate-100'}`}>
                      <ListTodo className="h-3.5 w-3.5" /> Summary
                    </button>
                  </div>

                  <button
                    onClick={rightPanelMode === 'translation' ? handleTranslate : handleSummarize}
                    disabled={!transcription.text || transcription.isTranscribing || translation.isTranslating || translation.isSummarizing || transcription.isRecording}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {rightPanelMode === 'translation' ? 'Translate Transcript' : 'Generate Summary'}
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!hasContent ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-white p-12 text-center">
                <div className="mb-6 rounded-full bg-indigo-50 p-6 text-indigo-600"><Mic className="h-12 w-12" /></div>
                <h3 className="text-2xl font-bold text-slate-900">Transcript Workspace</h3>
                <p className="mt-2 text-slate-500 max-w-md">Upload audio or start a live recording to begin. Your audio will be transcribed verbatim in its original language.</p>
              </div>
            ) : (
              <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-2">
                <ResultCard 
                  title="Verbatim Transcript"
                  content={transcription.text}
                  isLoading={transcription.isTranscribing}
                  progress={transcription.progress}
                  placeholder={transcription.isRecording ? "Listening... original audio will appear here verbatim." : "Transcription will appear here in the source language."}
                  variant="primary"
                />
                <ResultCard 
                  title={rightPanelMode === 'translation' ? "AI Translation" : "Meeting Summary"}
                  content={rightPanelMode === 'translation' ? (translation.translations[selectedTargetLang] || "") : (translation.summaries[selectedTargetLang] || "")}
                  isLoading={rightPanelMode === 'translation' ? translation.isTranslating : translation.isSummarizing}
                  progress={translation.progress}
                  language={selectedTargetLang}
                  placeholder={rightPanelMode === 'translation' ? "Select a target language and click 'Translate Transcript'." : "Click 'Generate Summary' to distill key insights."}
                  variant="secondary"
                />
              </div>
            )}
            {transcription.error && <div className="rounded-xl bg-red-50 p-4 border border-red-100 text-sm text-red-600 flex items-center gap-3"><X className="h-5 w-5" /><span>{transcription.error}</span></div>}
          </div>
        </div>
      </main>

      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={(rec) => { loadRecord(rec); setIsHistoryOpen(false); }} onDelete={(id) => { const newArchive = deleteRecord(id); setHistory(newArchive); if (activeRecordId === id) setActiveRecordId(null); }} />
    </div>
  );
}
