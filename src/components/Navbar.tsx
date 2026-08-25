import React from 'react';
import { Terminal, ShieldCheck, Cpu, RefreshCw, Key, Zap } from 'lucide-react';

interface NavbarProps {
  onReset: () => void;
  activeRole: string;
  activeCount: number;
  onOpenApiKeysModal: () => void;
  isLiveMode?: boolean;
  hasCrustKey?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onReset,
  activeRole,
  activeCount,
  onOpenApiKeysModal,
  isLiveMode = true,
  hasCrustKey = false,
}) => {
  return (
    <header className="border-b-2 border-slate-900 bg-white px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-3 shrink-0">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="bg-slate-900 text-white p-1 rounded-none">
            <Terminal className="w-5 h-5" />
          </div>
          <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter leading-none text-slate-900">
            Requirement Consolidated Automation
          </h1>
        </div>
        <p className="text-[11px] font-bold tracking-[0.25em] uppercase text-slate-500">
          JD Ingestion • Script Generation • Profile Extraction • Reverse Validation
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 self-end md:self-auto">
        {/* API Keys Configuration Button */}
        <button
          type="button"
          onClick={onOpenApiKeysModal}
          className={`border-2 border-slate-900 px-3 py-1.5 flex items-center gap-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 ${
            hasCrustKey
              ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              : 'bg-amber-400 text-slate-950 hover:bg-amber-300'
          }`}
          title="Configure API Keys for Live Crustdata & Gemini Execution"
        >
          <Key className="w-3.5 h-3.5" />
          <span>{hasCrustKey ? 'API Keys: Configured' : 'Configure API Keys'}</span>
          {isLiveMode && (
            <span className="flex items-center gap-1 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 font-mono">
              <Zap className="w-2.5 h-2.5 fill-amber-300 text-amber-300" />
              LIVE
            </span>
          )}
        </button>

        <div className="bg-slate-100 border border-slate-900 px-3 py-1.5 flex items-center gap-2 text-xs font-bold text-slate-900">
          <Cpu className="w-3.5 h-3.5 text-slate-700" />
          <span>{activeCount} Profiles Available</span>
        </div>

        <button
          onClick={onReset}
          title="Reset to defaults"
          className="border-2 border-slate-900 bg-white hover:bg-slate-100 text-slate-900 p-1.5 transition-colors flex items-center gap-1 text-xs font-bold uppercase tracking-wider cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Reset</span>
        </button>
      </div>
    </header>
  );
};

