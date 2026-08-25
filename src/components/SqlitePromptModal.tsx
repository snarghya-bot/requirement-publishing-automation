import React from 'react';
import { Database, Clock, RefreshCw, Layers, CheckCircle2, Building2 } from 'lucide-react';
import { SqlitePullHistory } from '../utils/sqliteStorage';

interface SqlitePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  previousPull: SqlitePullHistory;
  onMerge: () => void;
  onFresh: () => void;
  roleName: string;
}

export const SqlitePromptModal: React.FC<SqlitePromptModalProps> = ({
  isOpen,
  onClose,
  previousPull,
  onMerge,
  onFresh,
  roleName,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border-4 border-slate-900 shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-black uppercase tracking-wider">
              SQLite Talent Cache Detected
            </h2>
          </div>
          <span className="text-[10px] font-mono bg-amber-400 text-slate-900 font-bold px-2 py-0.5">
            JD MATCH
          </span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div className="bg-slate-50 border-2 border-slate-900 p-3.5 space-y-2">
            <p className="text-xs font-bold text-slate-900 uppercase flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-slate-700" />
              Existing Data in SQLite Database for this exact JD:
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
              <div className="bg-white border border-slate-300 p-2">
                <span className="text-[10px] text-slate-500 uppercase block font-bold">Saved Profiles</span>
                <span className="text-lg font-black text-slate-900">{previousPull.candidateCount} Profiles</span>
              </div>
              <div className="bg-white border border-slate-300 p-2">
                <span className="text-[10px] text-slate-500 uppercase block font-bold">Verified Citi Experience</span>
                <span className="text-lg font-black text-emerald-700">{previousPull.citiTalentCount} Candidates</span>
              </div>
            </div>
            <p className="text-[11px] text-slate-600 italic">
              Last pulled at: {new Date(previousPull.pulledAt).toLocaleString()}
            </p>
          </div>

          <p className="text-xs text-slate-700 font-medium">
            You are requesting a talent pull for the same Job Description (<strong>{roleName}</strong>).
            Would you like to <strong>merge</strong> newly pulled profiles with your previous SQLite database store, or pull <strong>fresh</strong>?
          </p>

          <div className="bg-amber-50 border border-amber-300 p-2.5 text-[11px] text-amber-900 space-y-1">
            <p><strong>• Merge (Recommended):</strong> Combines new profiles with previously stored talent, avoiding duplicates while preserving verified past Citi notes.</p>
            <p><strong>• Fresh Pull:</strong> Replaces existing SQLite records for this JD with the new search results.</p>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
            <button
              type="button"
              onClick={onMerge}
              className="bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-wider text-xs py-3 px-4 flex items-center justify-center gap-2 border-2 border-slate-900 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
            >
              <Layers className="w-4 h-4 text-emerald-400" />
              Merge with Previous
            </button>
            <button
              type="button"
              onClick={onFresh}
              className="bg-white hover:bg-slate-100 text-slate-900 font-black uppercase tracking-wider text-xs py-3 px-4 flex items-center justify-center gap-2 border-2 border-slate-900 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 text-slate-700" />
              Pull Fresh (Replace)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
