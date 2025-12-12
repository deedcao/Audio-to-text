import React from 'react';
import { ArchiveRecord } from '../types';
import { X, FileAudio, Trash2, Clock, CheckCircle2, Archive } from './Icons';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: ArchiveRecord[];
  onSelect: (record: ArchiveRecord) => void;
  onDelete: (id: string) => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onDelete
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Clock className="h-5 w-5 text-indigo-600" />
            Transcription History
          </h2>
          <button 
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {history.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-slate-500">
              <Archive className="mb-4 h-12 w-12 text-slate-300" />
              <p className="text-lg font-medium">No history yet</p>
              <p className="text-sm">Processed files will appear here automatically.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((record) => (
                <div 
                  key={record.id}
                  className="group relative flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-slate-50 p-4 transition-all hover:border-indigo-200 hover:bg-white hover:shadow-md"
                  onClick={() => onSelect(record)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                      <FileAudio className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 line-clamp-1">{record.fileName}</h3>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{(record.fileSize / (1024 * 1024)).toFixed(2)} MB</span>
                        <span>•</span>
                        <span>{new Date(record.createdAt).toLocaleDateString()}</span>
                        {Object.keys(record.translations).length > 0 && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1 text-emerald-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              {Object.keys(record.translations).length} translations
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(record.id);
                    }}
                    className="rounded-full p-2 text-slate-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                    title="Delete from history"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};