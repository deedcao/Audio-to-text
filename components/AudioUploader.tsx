import React, { useCallback, useState } from 'react';
import { UploadCloud, FileAudio } from './Icons';

interface AudioUploaderProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export const AudioUploader: React.FC<AudioUploaderProps> = ({ onFileSelect, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      validateAndProcess(file);
    }
  }, [disabled, onFileSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndProcess(e.target.files[0]);
    }
  };

  const validateAndProcess = (file: File) => {
    const validMimeTypes = [
      'audio/mpeg', 'audio/mp3', 
      'audio/wav', 'audio/x-wav',
      'audio/mp4', 'audio/x-m4a', 'audio/m4a',
      'application/octet-stream' // often m4a shows up as this
    ];
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    const validExtensions = ['mp3', 'wav', 'm4a', 'mp4'];
    
    // Check extension primarily as MIME type detection in browser can be spotty for m4a
    const isValidExtension = ext && validExtensions.includes(ext);

    if (isValidExtension) {
      onFileSelect(file);
    } else {
      alert("Please upload a valid MP3, WAV, or M4A file.");
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative overflow-hidden rounded-2xl border-2 border-dashed transition-all duration-300 ease-in-out
        ${isDragging 
          ? 'border-indigo-500 bg-indigo-50/50 scale-[1.01]' 
          : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
        }
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      <input
        type="file"
        accept=".mp3,.wav,.m4a,.mp4,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
        onChange={handleInputChange}
        disabled={disabled}
        className="absolute inset-0 z-10 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className={`mb-4 rounded-full p-4 transition-colors ${isDragging ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
          {isDragging ? <FileAudio className="h-8 w-8" /> : <UploadCloud className="h-8 w-8" />}
        </div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">
          Drop your audio file here
        </h3>
        <p className="mb-4 text-sm text-slate-500">
          Supports MP3, WAV, M4A
        </p>
        <button 
          className="rounded-full bg-slate-900 px-6 py-2 text-sm font-medium text-white shadow-sm transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none"
          type="button"
        >
          Select File
        </button>
      </div>
    </div>
  );
};