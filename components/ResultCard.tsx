import React, { useState } from 'react';
import { Copy, CheckCircle2, Languages, Loader2 } from './Icons';
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
  placeholder = "Result will appear here...",
  variant = 'primary'
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPrimary = variant === 'primary';

  return (
    <div className={`
      flex h-full flex-col overflow-hidden rounded-2xl border shadow-sm transition-all
      ${isPrimary ? 'border-indigo-100 bg-white' : 'border-slate-200 bg-slate-50/50'}
    `}>
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-lg p-2 ${isPrimary ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'}`}>
            <Languages className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {language && <p className="text-xs text-slate-500">{language}</p>}
          </div>
        </div>
        
        {content && !isLoading && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            {copied ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        )}
      </div>

      <div className="relative flex-1 p-6">
        {isLoading ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-6 text-slate-400 p-8">
            <div className="relative">
               <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
               <div className="absolute inset-0 flex items-center justify-center">
                 <div className="h-6 w-6 rounded-full bg-indigo-50/50 animate-pulse" />
               </div>
            </div>
            <div className="w-full max-w-[240px]">
              <ProgressBar progress={progress} label="Processing..." color={isPrimary ? "bg-indigo-600" : "bg-emerald-600"} />
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto max-h-[400px]">
            {content ? (
              <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
                {content}
              </p>
            ) : (
              <div className="flex h-full items-center justify-center text-slate-400 italic">
                {placeholder}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
