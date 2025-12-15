import React from 'react';

interface ProgressBarProps {
  progress: number;
  label?: string;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  progress, 
  label, 
  color = 'bg-indigo-600' 
}) => {
  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between mb-1">
          <span className="text-xs font-medium text-slate-700">{label}</span>
          <span className="text-xs font-medium text-slate-500">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
        <div 
          className={`h-2.5 rounded-full transition-all duration-300 ease-out ${color}`} 
          style={{ width: `${Math.max(5, Math.min(100, progress))}%` }}
        >
          <div className="w-full h-full opacity-30 bg-white/30 animate-[shimmer_2s_infinite] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.5),transparent)] bg-[length:200%_100%]" />
        </div>
      </div>
    </div>
  );
};
