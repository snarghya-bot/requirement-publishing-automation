import React, { useState } from 'react';
import { X, Upload, Terminal, Check, AlertCircle } from 'lucide-react';
import { parseTerminalOrCsvOutput } from '../utils/terminalParser';
import { CandidateProfile, ReverseValidationResult } from '../types';

interface ImportOutputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (candidates: CandidateProfile[], validations: Record<string, ReverseValidationResult>) => void;
}

export const ImportOutputModal: React.FC<ImportOutputModalProps> = ({
  isOpen,
  onClose,
  onImport,
}) => {
  const [textInput, setTextInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleProcessImport = () => {
    if (!textInput.trim()) {
      setError('Please paste terminal output or CSV content.');
      return;
    }

    try {
      const { candidates, validations } = parseTerminalOrCsvOutput(textInput);
      if (candidates.length === 0) {
        setError('No candidate records could be parsed. Ensure the table or CSV format matches the Python script output.');
        return;
      }

      onImport(candidates, validations);
      onClose();
    } catch (e: any) {
      setError(`Parsing failed: ${e.message}`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setTextInput(content);
        setError(null);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white border-2 border-slate-900 shadow-[6px_6px_0px_0px_rgba(15,23,42,1)] w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b-2 border-slate-900 bg-slate-900 text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-black uppercase tracking-wider">
              Import Python Terminal / CSV Results
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1 text-xs">
          <p className="text-slate-700">
            Paste the terminal output table from running your Python pipeline script (e.g., <code>MF_L2.py</code>) or upload an exported CSV file.
          </p>

          <div className="flex items-center gap-2">
            <label className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 font-bold px-3 py-1.5 flex items-center gap-1.5 cursor-pointer text-xs">
              <Upload className="w-3.5 h-3.5" />
              Upload .csv or .txt file
              <input
                type="file"
                accept=".csv,.txt,.log"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <span className="text-slate-400 text-[11px]">or paste below:</span>
          </div>

          <textarea
            value={textInput}
            onChange={(e) => {
              setTextInput(e.target.value);
              setError(null);
            }}
            placeholder={`Paste your terminal grid here, for example:\n+------+--------------------+------------------+--------+-------+----------+\n| No.  | Candidate Name     | Verdict          | Score  | YoE   | Country  |\n| 1    | Mohd Anam          | STRONG MATCH     | 90     | 6.0   | India    |`}
            rows={10}
            className="w-full font-mono text-[11px] p-2.5 bg-slate-50 border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900 leading-relaxed"
          />

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-800 flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-slate-900 bg-slate-50 p-3 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 border border-slate-300 font-bold text-xs hover:bg-slate-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleProcessImport}
            className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs uppercase tracking-wider px-4 py-1.5 border border-slate-900 flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            Import & Render Profiles
          </button>
        </div>
      </div>
    </div>
  );
};
