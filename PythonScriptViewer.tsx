import React, { useState } from 'react';
import { Play, Copy, Check, Download, Terminal, Sparkles, FileCode2, Key, Zap } from 'lucide-react';

interface PythonScriptViewerProps {
  script: string;
  onExecute: () => void;
  isExecuting: boolean;
  roleName: string;
  onOpenApiKeysModal?: () => void;
  isLiveMode?: boolean;
  hasCrustKey?: boolean;
}

export const PythonScriptViewer: React.FC<PythonScriptViewerProps> = ({
  script,
  onExecute,
  isExecuting,
  roleName,
  onOpenApiKeysModal,
  isLiveMode = true,
  hasCrustKey = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([script], { type: 'text/x-python;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `rca_${roleName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_pipeline.py`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border-2 border-slate-900 bg-white flex flex-col h-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
      {/* Header Bar */}
      <div className="bg-slate-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider">
            GENERATED_AUTOMATION_PIPELINE.PY
          </span>
          {isLiveMode && (
            <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[9px] px-1.5 py-0.5 font-mono flex items-center gap-1">
              <Zap className="w-2.5 h-2.5 fill-emerald-300" />
              LIVE ENGINE READY
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenApiKeysModal && (
            <button
              type="button"
              onClick={onOpenApiKeysModal}
              className="bg-slate-800 hover:bg-slate-700 text-amber-300 px-2 py-1 text-[11px] font-mono flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
              title="Configure API Keys"
            >
              <Key className="w-3 h-3" />
              {hasCrustKey ? 'API KEYS: SET' : 'PROVIDE API KEYS'}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            className="hover:bg-slate-800 text-slate-300 hover:text-white px-2 py-1 text-[11px] font-mono flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
            title="Copy script to clipboard"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            {copied ? 'COPIED' : 'COPY'}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            className="hover:bg-slate-800 text-slate-300 hover:text-white px-2 py-1 text-[11px] font-mono flex items-center gap-1 border border-slate-700 transition-colors cursor-pointer"
            title="Download .py file"
          >
            <Download className="w-3 h-3" />
            DOWNLOAD
          </button>
        </div>
      </div>

      {/* Script Code Viewer */}
      <div className="p-4 bg-slate-950 text-emerald-400 font-mono text-[11px] leading-relaxed flex-1 overflow-y-auto max-h-[380px] select-text">
        <pre className="whitespace-pre font-mono">
          {script}
        </pre>
      </div>

      {/* Action Footer Bar */}
      <div className="p-3 bg-slate-100 border-t-2 border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0">
        <div className="text-[11px] text-slate-600 font-medium flex items-center gap-2">
          <span>Target Role: <strong className="text-slate-900">{roleName || 'Unspecified'}</strong></span>
          {hasCrustKey && (
            <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 border border-emerald-300">
              Live Crustdata Connected
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {onOpenApiKeysModal && !hasCrustKey && (
            <button
              type="button"
              onClick={onOpenApiKeysModal}
              className="px-3 py-2 text-xs font-bold uppercase tracking-wider border border-slate-900 bg-amber-300 hover:bg-amber-200 text-slate-900 flex items-center gap-1 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              API Key Setup
            </button>
          )}

          <button
            type="button"
            onClick={onExecute}
            disabled={isExecuting}
            className={`flex-1 sm:flex-none px-6 py-2.5 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-2 border-slate-900 transition-all ${
              isExecuting
                ? 'bg-amber-400 text-slate-950 animate-pulse cursor-wait'
                : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isExecuting ? 'Executing Live Script Pipeline...' : 'Run Python Script & Extract Profiles'}
          </button>
        </div>
      </div>
    </div>
  );
};

