import React, { useState, useEffect } from 'react';
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
  unifyTranscriptStyle
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
import { 
  X, 
  Languages, 
  ArrowRight, 
  History, 
  FileAudio,
  CheckCircle2
} from './components/Icons';

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    // FIX: All declarations of 'aistudio' must have identical modifiers. 
    // Making it optional to match the environment's base definition.
    aistudio?: AIStudio;
  }
}

export default function App() {
  const [audioState, setAudioState] = useState<AudioFileState>({ file: null, base64: null, mimeType: null, duration: null });
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionState>({ text: '', isTranscribing: false, progress: 0, error: null });
  const [translation, setTranslation] = useState<TranslationState>({ translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null });
  const [selectedTargetLang, setSelectedTargetLang] = useState<SupportedLanguage>(SupportedLanguage.CHINESE_SIMPLIFIED);
  const [rightPanelMode, setRightPanelMode] = useState<'translation' | 'summary'>('translation');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [history, setHistory] = useState<ArchiveRecord[]>([]);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    setHistory(getArchive());
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      // FIX: Use optional chaining to avoid crashing if aistudio is missing.
      const selected = await window.aistudio?.hasSelectedApiKey();
      setHasApiKey(!!selected);
    } catch (e) {
      console.error("API check failed", e);
    }
  };

  const handleOpenKeySelection = async () => {
    // FIX: Use optional chaining for safety when triggering the key selection dialog.
    await window.aistudio?.openSelectKey();
    setHasApiKey(true);
    setTranscription(prev => ({ ...prev, error: null }));
  };

  const handleFileSelect = async (file: File) => {
    const existing = findRecordForFile(file);
    if (existing) {
      loadRecord(existing);
      return;
    }

    setAudioState({ file, base64: null, mimeType: file.type, duration: null });
    setActiveRecordId(null);
    setTranscription({ text: '', isTranscribing: true, progress: 0, error: null });
    setTranslation({ translations: {}, summaries: {}, isTranslating: false, isSummarizing: false, progress: 0, error: null });

    try {
      const chunks = await processLargeAudioFile(file);
      const results: string[] = new Array(chunks.length).fill("");
      let completedChunks = 0;

      const CONCURRENCY = 2;
      const queue = [...chunks.keys()];
      
      const worker = async () => {
        while (queue.length > 0) {
          const idx = queue.shift()!;
          try {
            const part = await transcribeAudio(chunks[idx], 'audio/wav', true);
            results[idx] = part;
          } catch (err: any) {
            if (err.message === "QUOTA_EXHAUSTED" || err.message.includes("Requested entity")) throw err;
            results[idx] = `[分段 ${idx + 1} 识别失败]`;
          } finally {
            completedChunks++;
            const progress = Math.round((completedChunks / chunks.length) * 90);
            setTranscription(prev => ({ 
              ...prev, 
              progress,
              text: results.filter(r => r).join('\n\n')
            }));
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }).map(worker));

      const rawText = results.filter(r => r && !r.includes("识别失败")).join('\n\n');
      if (!rawText.trim()) throw new Error("识别结果为空，请检查音频质量。");

      setTranscription(prev => ({ ...prev, progress: 95 }));
      const finalTranscript = rawText.length < 25000 ? await unifyTranscriptStyle(rawText) : rawText;

      setTranscription(prev => ({ ...prev, text: finalTranscript, isTranscribing: false, progress: 100 }));
      
      const record: ArchiveRecord = {
        id: `${file.name}-${Date.now()}`,
        fileName: file.name, fileSize: file.size, lastModified: file.lastModified,
        mimeType: file.type, transcription: finalTranscript, translations: {}, createdAt: Date.now()
      };
      
      saveRecord(record);
      setActiveRecordId(record.id);
      setHistory(getArchive());
    } catch (err: any) {
      let msg = err.message || String(err);
      if (msg.includes("Requested entity")) {
        setHasApiKey(false);
        await handleOpenKeySelection();
        return;
      }
      setTranscription(prev => ({ ...prev, isTranscribing: false, error: msg === "QUOTA_EXHAUSTED" ? "配额用尽，请设置 API Key。" : msg }));
    }
  };

  const loadRecord = (rec: ArchiveRecord) => {
    setActiveRecordId(rec.id);
    setTranscription({ text: rec.transcription, isTranscribing: false, progress: 100, error: null });
    setTranslation({ 
      translations: rec.translations, 
      summaries: rec.summaries || {}, 
      isTranslating: false, isSummarizing: false, 
      progress: 100, error: null 
    });
  };

  const handleTranslate = async () => {
    if (!transcription.text || translation.isTranslating) return;
    setTranslation(prev => ({ ...prev, isTranslating: true, progress: 0, error: null }));
    try {
      const res = await translateText(transcription.text, selectedTargetLang, (p) => setTranslation(prev => ({ ...prev, progress: p })));
      const newTrans = { ...translation.translations, [selectedTargetLang]: res };
      setTranslation(prev => ({ ...prev, translations: newTrans, isTranslating: false }));
      updateRecordInStorage({ translations: newTrans });
    } catch (err) {
      setTranslation(prev => ({ ...prev, isTranslating: false, error: "翻译失败" }));
    }
  };

  const handleSummarize = async () => {
    if (!transcription.text || translation.isSummarizing) return;
    setTranslation(prev => ({ ...prev, isSummarizing: true, progress: 0, error: null }));
    try {
      const res = await generateSummary(transcription.text, selectedTargetLang);
      const newSums = { ...translation.summaries, [selectedTargetLang]: res };
      setTranslation(prev => ({ ...prev, summaries: newSums, isSummarizing: false }));
      updateRecordInStorage({ summaries: newSums });
    } catch (err) {
      setTranslation(prev => ({ ...prev, isSummarizing: false, error: "总结失败" }));
    }
  };

  const updateRecordInStorage = (updates: Partial<ArchiveRecord>) => {
    if (!activeRecordId) return;
    const archive = getArchive();
    const rec = archive.find(r => r.id === activeRecordId);
    if (rec) {
      Object.assign(rec, updates);
      saveRecord(rec);
      setHistory(getArchive());
    }
  };

  const hasContent = transcription.text || transcription.isTranscribing;

  return (
    <div className="h-screen flex flex-col bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden">
      <header className="shrink-0 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg">
              <Languages className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 leading-tight">AudioGlot AI</h1>
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                <span className={`h-1.5 w-1.5 rounded-full ${hasApiKey ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                {hasApiKey ? 'Performance' : 'Standard'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={handleOpenKeySelection} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
              API 管理
            </button>
            <button onClick={() => setIsHistoryOpen(true)} className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-black text-white hover:bg-slate-800 transition-all shadow-lg">
              <History className="h-4 w-4" /> 历史记录
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-hidden p-6">
        <div className="mx-auto max-w-[1600px] h-full grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Panel: Upload & Controls */}
          <div className="lg:col-span-3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
            <div className="shrink-0 rounded-[2rem] bg-white p-6 shadow-sm border border-slate-100">
              <h2 className="mb-4 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <span className="h-1 w-3 bg-indigo-600 rounded-full" /> 音频解析
              </h2>
              <AudioUploader onFileSelect={handleFileSelect} disabled={transcription.isTranscribing} />
            </div>

            {hasContent && (
              <div className="rounded-[2rem] bg-slate-900 p-6 shadow-2xl text-white border border-slate-800 animate-in fade-in slide-in-from-left-4">
                <h2 className="mb-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 flex items-center gap-2">
                  <span className="h-1 w-3 bg-indigo-400 rounded-full" /> 智能指令
                </h2>
                
                <div className="space-y-5">
                  <div>
                    <label className="mb-2 block text-[9px] font-black text-slate-400 uppercase tracking-widest">目标输出语言</label>
                    <select 
                      value={selectedTargetLang}
                      onChange={(e) => setSelectedTargetLang(e.target.value as SupportedLanguage)}
                      className="w-full rounded-xl border-0 bg-white/10 p-4 text-xs font-bold text-white ring-1 ring-white/20 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    >
                      {Object.values(SupportedLanguage).map(lang => (
                        <option key={lang} value={lang} className="text-slate-900">{lang}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex p-1 bg-white/5 rounded-xl">
                    <button onClick={() => setRightPanelMode('translation')} className={`flex-1 py-2.5 text-[11px] font-black rounded-lg transition-all ${rightPanelMode === 'translation' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>全文翻译</button>
                    <button onClick={() => setRightPanelMode('summary')} className={`flex-1 py-2.5 text-[11px] font-black rounded-lg transition-all ${rightPanelMode === 'summary' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>智能总结</button>
                  </div>

                  <button
                    onClick={rightPanelMode === 'translation' ? handleTranslate : handleSummarize}
                    disabled={!transcription.text || transcription.isTranscribing || translation.isTranslating || translation.isSummarizing}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-4 text-xs font-black text-slate-900 hover:bg-indigo-50 transition-all active:scale-95 disabled:opacity-20 disabled:active:scale-100"
                  >
                    执行分析 <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel: Result Display */}
          <div className="lg:col-span-9 h-full flex flex-col gap-6 overflow-hidden">
            {!hasContent ? (
              <div className="flex h-full flex-col items-center justify-center rounded-[3rem] border-2 border-dashed border-slate-200 bg-white/50 p-12 text-center group">
                <div className="mb-8 rounded-full bg-white p-10 shadow-xl text-indigo-500 group-hover:scale-110 transition-all duration-500 ring-8 ring-indigo-50/50">
                  <FileAudio className="h-12 w-12" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 tracking-tight">准备就绪</h3>
                <p className="mt-3 text-slate-500 max-w-sm font-medium leading-relaxed text-sm">
                  请上传音频文件。我们将采用高精度识别模型，为您还原最真实的对话内容。
                </p>
              </div>
            ) : (
              <div className="flex-1 grid grid-cols-1 gap-6 lg:grid-cols-2 h-full overflow-hidden">
                <ResultCard 
                  title="识别原文" 
                  content={transcription.text} 
                  isLoading={transcription.isTranscribing} 
                  progress={transcription.progress} 
                  variant="primary" 
                />
                <ResultCard 
                  title={rightPanelMode === 'translation' ? "AI 翻译" : "分析报告"} 
                  content={rightPanelMode === 'translation' ? (translation.translations[selectedTargetLang] || "") : (translation.summaries[selectedTargetLang] || "")} 
                  isLoading={rightPanelMode === 'translation' ? translation.isTranslating : translation.isSummarizing} 
                  progress={translation.progress} 
                  language={selectedTargetLang} 
                  variant="secondary" 
                />
              </div>
            )}

            {transcription.error && (
              <div className="shrink-0 rounded-xl bg-red-50 p-4 border border-red-100 text-[11px] font-bold text-red-600 flex items-center gap-3 animate-in slide-in-from-top-2">
                <div className="bg-red-600 text-white rounded-full p-1"><X className="h-3 w-3" /></div>
                <span>{transcription.error}</span>
              </div>
            )}
          </div>
        </div>
      </main>

      <HistoryModal isOpen={isHistoryOpen} onClose={() => setIsHistoryOpen(false)} history={history} onSelect={(rec) => { loadRecord(rec); setIsHistoryOpen(false); }} onDelete={(id) => { setHistory(deleteRecord(id)); }} />
    </div>
  );
}