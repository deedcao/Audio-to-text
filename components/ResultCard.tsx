
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Copy, CheckCircle2, Languages, Loader2, Search, ArrowDown, ArrowUp } from './Icons';
import { ProgressBar } from './ProgressBar';

interface ResultCardProps {
  title: string;
  content: string;
  isLoading?: boolean;
  progress?: number;
  language?: string;
  placeholder?: string;
  variant?: 'primary' | 'secondary';
}

export const ResultCard: React.FC<ResultCardProps> = ({ 
  title, 
  content, 
  isLoading, 
  progress = 0,
  language,
  placeholder = "等待生成结果...",
  variant = 'primary'
}) => {
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAutoScroll = useRef(true);

  useEffect(() => {
    if (scrollRef.current && isAutoScroll.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [content]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 100;
    isAutoScroll.current = isAtBottom;
    setShowScrollButtons(scrollTop > 300);
  };

  const scrollToTop = () => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const wordCount = useMemo(() => {
    return content.trim() ? (content.match(/[\u4e00-\u9fa5]|\w+/g)?.length || 0) : 0;
  }, [content]);

  const lines = useMemo(() => {
    return content.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  }, [content]);

  const filteredLines = useMemo(() => {
    if (!searchTerm) return lines;
    return lines.filter(line => line.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [lines, searchTerm]);

  const renderLineContent = (line: string) => {
    const speakerMatch = line.match(/^((?:Speaker|发言者|SPEAKER)\s*\d+)\s*[:：]/i);
    let displayLine = line;
    let label = "";

    if (speakerMatch) {
      label = speakerMatch[0];
      displayLine = line.slice(label.length).trim();
    }

    // Highlighting search term
    if (searchTerm && displayLine.toLowerCase().includes(searchTerm.toLowerCase())) {
      const parts = displayLine.split(new RegExp(`(${searchTerm})`, 'gi'));
      return (
        <div className="flex gap-3">
          {label && (
            <span className="shrink-0 text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 h-fit rounded border border-indigo-100 uppercase mt-1">
              {label.replace(/[：]/, ':').toUpperCase()}
            </span>
          )}
          <span className="flex-1">
            {parts.map((part, i) => 
              part.toLowerCase() === searchTerm.toLowerCase() 
                ? <mark key={i} className="bg-amber-200 text-slate-900 rounded px-0.5">{part}</mark> 
                : part
            )}
          </span>
        </div>
      );
    }

    return (
      <div className="flex gap-3">
        {label && (
          <span className="shrink-0 text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 h-fit rounded border border-indigo-100 uppercase mt-1">
            {label.replace(/[：]/, ':').toUpperCase()}
          </span>
        )}
        <span className="flex-1">{displayLine}</span>
      </div>
    );
  };

  const isPrimary = variant === 'primary';

  return (
    <div className={`
      flex h-full flex-col overflow-hidden rounded-[2.5rem] border shadow-sm transition-all duration-500 bg-white
      ${isPrimary ? 'border-indigo-100' : 'border-slate-200'}
    `}>
      {/* Card Header */}
      <div className="shrink-0 border-b border-slate-100 px-6 py-4 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`rounded-xl p-2.5 ${isPrimary ? 'bg-indigo-600 text-white shadow-md' : 'bg-emerald-50 text-emerald-600'}`}>
              <Languages className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-black text-slate-900 tracking-tight">{title}</h3>
              <div className="flex items-center gap-2 mt-0.5">
                {language && <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{language}</span>}
                <span className="text-[9px] font-bold text-slate-300">|</span>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{wordCount} 字数</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {!isLoading && content && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 rounded-full border border-slate-100 bg-white px-3 py-1.5 text-[10px] font-black text-slate-600 hover:bg-slate-50 active:scale-95 transition-all"
              >
                {copied ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                {copied ? '已复制' : '拷贝'}
              </button>
            )}
          </div>
        </div>

        {/* Search Bar inside Card */}
        {content && !isLoading && (
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
            <input 
              type="text" 
              placeholder="搜索转录内容..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 rounded-lg py-2 pl-8 pr-4 text-[11px] font-medium border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
          </div>
        )}
      </div>

      {/* Card Content Area */}
      <div className="relative flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
            <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
            <div className="w-full max-w-[200px]">
              <ProgressBar progress={progress} label="AI 分析中..." color={isPrimary ? "bg-indigo-600" : "bg-emerald-600"} />
            </div>
          </div>
        ) : (
          <>
            <div 
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-full overflow-y-auto px-6 py-4 custom-scrollbar scroll-smooth"
            >
              {filteredLines.length > 0 ? (
                <div className="space-y-2 text-sm leading-relaxed text-slate-700 font-medium pb-12">
                  {filteredLines.map((line, idx) => {
                    const isLast = idx === filteredLines.length - 1 && !searchTerm;
                    return (
                      <div 
                        key={idx} 
                        className={`
                          transition-all duration-300 p-2 rounded-lg border-l-4 border-transparent hover:bg-slate-50
                          ${isLast ? 'bg-indigo-50/30 border-indigo-400' : ''}
                        `}
                      >
                        {renderLineContent(line)}
                      </div>
                    );
                  })}
                  {isLoading === false && content && !searchTerm && (
                    <div className="flex items-center justify-center pt-4 opacity-30">
                      <div className="h-1 w-12 bg-slate-200 rounded-full" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-slate-300 text-xs font-bold italic">
                  {searchTerm ? "未找到相关内容" : placeholder}
                </div>
              )}
            </div>

            {/* Quick Navigation Buttons */}
            {showScrollButtons && (
              <div className="absolute right-6 bottom-6 flex flex-col gap-2">
                <button onClick={scrollToTop} className="p-2.5 rounded-full bg-white shadow-lg border border-slate-100 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all active:scale-90">
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button onClick={scrollToBottom} className="p-2.5 rounded-full bg-indigo-600 shadow-lg text-white hover:bg-indigo-700 transition-all active:scale-90">
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
