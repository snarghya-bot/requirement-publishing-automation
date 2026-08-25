import React, { useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, CheckCircle2, Loader2, AlertCircle, Play, Table, Sparkles, Download, Key } from 'lucide-react';

interface LogLine {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'dim' | 'highlight' | 'debug';
  timestamp: string;
}

interface ExecutionTerminalProps {
  logs: LogLine[];
  isExecuting: boolean;
  progressPercent: number;
  onClear: () => void;
  onRunPipeline?: () => void;
  onViewTable?: () => void;
  onOpenApiKeysModal?: () => void;
}

export const ExecutionTerminal: React.FC<ExecutionTerminalProps> = ({
  logs,
  isExecuting,
  progressPercent,
  onClear,
  onRunPipeline,
  onViewTable,
  onOpenApiKeysModal,
}) => {
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="border-2 border-slate-900 bg-slate-950 text-slate-100 flex flex-col h-full shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
      {/* Terminal Title Bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500 inline-block"></span>
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block"></span>
          <span className="text-xs font-mono font-bold text-slate-200 ml-2 flex items-center gap-1.5">
            <TerminalIcon className="w-3.5 h-3.5 text-emerald-400" />
            PIPELINE_IN_APP_RUNNER :: STDOUT (Gemini 3.1 Flash-Lite)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {isExecuting && (
            <div className="flex items-center gap-1.5 text-xs text-amber-400 font-mono bg-slate-800 px-2 py-0.5 border border-slate-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>RUNNING ({progressPercent}%)</span>
            </div>
          )}
          {!isExecuting && logs.length > 0 && (
            <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800 px-2 py-0.5 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> PIPELINE EXIT 0 (OK)
            </span>
          )}

          {onRunPipeline && (
            <button
              type="button"
              onClick={onRunPipeline}
              disabled={isExecuting}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-slate-950" />
              <span>{isExecuting ? 'Running...' : 'Run Pipeline'}</span>
            </button>
          )}

          {onViewTable && logs.length > 0 && (
            <button
              type="button"
              onClick={onViewTable}
              className="px-2.5 py-1 text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 flex items-center gap-1 cursor-pointer"
            >
              <Table className="w-3 h-3 text-cyan-400" />
              <span>View Table</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClear}
            className="text-[10px] font-mono text-slate-400 hover:text-white uppercase px-1.5 py-0.5 hover:bg-slate-800"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Terminal Output Area */}
      <div className="p-4 font-mono text-xs leading-relaxed flex-1 overflow-y-auto min-h-[380px] max-h-[500px] space-y-1 select-text bg-slate-950">
        {logs.length === 0 ? (
          <div className="text-slate-400 py-12 text-center space-y-3">
            <p className="text-slate-300 font-mono text-sm">
              Ready to execute sourcing and reverse evaluation pipeline within the app.
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Click <strong>"Run Pipeline"</strong> above or in the left sidebar to start live talent extraction, Gemini 3.1 Flash-Lite reverse JD validation, and Citi intelligence detection.
            </p>
            {onRunPipeline && (
              <button
                type="button"
                onClick={onRunPipeline}
                className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-bold text-xs shadow-[2px_2px_0px_0px_rgba(255,255,255,0.2)] cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-slate-950" />
                Run Pipeline Inside App Now
              </button>
            )}
          </div>
        ) : (
          logs.map((log) => {
            let colorClass = 'text-slate-300';
            if (log.type === 'success') colorClass = 'text-emerald-400 font-semibold';
            if (log.type === 'warn') colorClass = 'text-amber-400';
            if (log.type === 'dim') colorClass = 'text-slate-500';
            if (log.type === 'highlight') colorClass = 'text-cyan-300 font-bold';
            if (log.type === 'debug') colorClass = 'text-fuchsia-300 bg-fuchsia-950/40 border-l-2 border-fuchsia-400 pl-2 py-0.5';

            return (
              <div key={log.id} className="flex items-start gap-2">
                <span className="text-slate-600 select-none text-[10px] shrink-0 pt-0.5 font-mono">
                  [{log.timestamp}]
                </span>
                <span className={`break-words whitespace-pre-wrap font-mono ${colorClass}`}>
                  {log.text}
                </span>
              </div>
            );
          })
        )}
        <div ref={terminalEndRef} />
      </div>

      {/* Progress Bar */}
      {isExecuting && (
        <div className="w-full bg-slate-900 h-1.5 overflow-hidden">
          <div
            className="bg-emerald-500 h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
    </div>
  );
};
