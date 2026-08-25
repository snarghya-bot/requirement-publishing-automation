import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Eye,
  EyeOff,
  Zap,
  Cpu,
  Terminal,
  ExternalLink,
  X,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Clock,
  Activity,
  BarChart3,
  Flame,
  ArrowUpRight,
  Info,
  Server,
  Layers,
  RotateCcw,
} from 'lucide-react';

export interface ApiKeysConfig {
  crustdataApiKey: string;
  geminiApiKey: string;
  isLiveMode: boolean;
}

interface ModelQuotaStat {
  model: string;
  displayName: string;
  dailyLimit: number;
  rpmLimit: number;
  tpmLimit: number;
  description: string;
  usedToday: number;
  remainingToday: number;
  usagePercentage: number;
  currentRpm: number;
  status: 'HEALTHY' | 'WARNING' | 'EXHAUSTED';
}

interface RequestLogEntry {
  id: string;
  timestamp: number;
  model: string;
  success: boolean;
  status: number;
  error?: string;
}

interface GeminiQuotaData {
  currentDayUTC: string;
  resetInFormatted: string;
  resetInMs: number;
  totalRequestsToday: number;
  currentRpmTotal: number;
  tier: string;
  lastRateLimitError: { timestamp: number; model: string; error: string } | null;
  models: ModelQuotaStat[];
  recentHistory: RequestLogEntry[];
}

interface ApiKeyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ApiKeysConfig;
  onSaveConfig: (config: ApiKeysConfig) => void;
  onShowToast: (msg: string) => void;
}

export const ApiKeyConfigModal: React.FC<ApiKeyConfigModalProps> = ({
  isOpen,
  onClose,
  config,
  onSaveConfig,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'credentials' | 'quota'>('credentials');

  const [crustdataKey, setCrustdataKey] = useState(config.crustdataApiKey || '');
  const [geminiKey, setGeminiKey] = useState(config.geminiApiKey || '');
  const [isLiveMode, setIsLiveMode] = useState(config.isLiveMode ?? true);

  const [showCrustKey, setShowCrustKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const [isVerifying, setIsVerifying] = useState(false);
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<{
    crustdata?: { valid: boolean; message: string; status: string; latencyMs?: number };
    gemini?: { valid: boolean; message: string; status: string; latencyMs?: number };
  } | null>(null);

  // Real-time Gemini Quota state
  const [quotaData, setQuotaData] = useState<GeminiQuotaData | null>(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [isResettingQuota, setIsResettingQuota] = useState(false);

  const fetchQuotaData = async () => {
    try {
      setIsLoadingQuota(true);
      const res = await fetch('/api/gemini-quota');
      const json = await res.json();
      if (json && json.data) {
        setQuotaData(json.data);
      }
    } catch (err) {
      console.error('Failed to load Gemini quota telemetry:', err);
    } finally {
      setIsLoadingQuota(false);
    }
  };

  // Poll quota stats when modal is open
  useEffect(() => {
    if (isOpen) {
      fetchQuotaData();
      const interval = setInterval(fetchQuotaData, 6000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleVerifyApiKeys = async () => {
    setIsVerifying(true);
    setTestResults(null);

    try {
      const res = await fetch('/api/test-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          crustdataApiKey: crustdataKey.trim(),
          geminiApiKey: geminiKey.trim(),
        }),
      });

      const data = await res.json();
      const timestamp = new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      setLastVerifiedAt(timestamp);

      if (data && data.quota) {
        setQuotaData(data.quota);
      }

      if (data && data.results) {
        setTestResults(data.results);
        const crustOk = data.results.crustdata?.valid;
        const geminiOk = data.results.gemini?.valid;

        if (crustOk && geminiOk) {
          onShowToast('✓ Both Crustdata and Gemini API keys verified and active!');
        } else if (crustOk) {
          onShowToast('✓ Crustdata API key verified. Gemini connected via fallback.');
        } else if (geminiOk) {
          onShowToast('✓ Gemini API key active and ready.');
        } else {
          onShowToast('API verification finished. See test results below.');
        }
      } else {
        setTestResults({
          crustdata: { valid: false, message: 'Unexpected response format from server', status: 'error' },
          gemini: { valid: false, message: 'Unexpected response format from server', status: 'error' },
        });
        onShowToast('Verification failed to parse server response.');
      }
    } catch (err: any) {
      setTestResults({
        crustdata: { valid: false, message: 'Network ping error: ' + err.message, status: 'error' },
        gemini: { valid: false, message: 'Network ping error: ' + err.message, status: 'error' },
      });
      onShowToast('Verification connection error.');
    } finally {
      setIsVerifying(false);
      fetchQuotaData();
    }
  };

  const handleResetQuota = async () => {
    try {
      setIsResettingQuota(true);
      const res = await fetch('/api/gemini-quota/reset', { method: 'POST' });
      const json = await res.json();
      if (json && json.data) {
        setQuotaData(json.data);
        onShowToast('✓ Gemini session quota counters reset.');
      }
    } catch (err: any) {
      onShowToast('Failed to reset quota tracker: ' + err.message);
    } finally {
      setIsResettingQuota(false);
    }
  };

  const handleSave = () => {
    onSaveConfig({
      crustdataApiKey: crustdataKey.trim(),
      geminiApiKey: geminiKey.trim(),
      isLiveMode,
    });
    onShowToast('API Credentials & Live Execution settings applied.');
    onClose();
  };

  const handleClear = () => {
    setCrustdataKey('');
    setGeminiKey('');
    setTestResults(null);
    setLastVerifiedAt(null);
    onSaveConfig({
      crustdataApiKey: '',
      geminiApiKey: '',
      isLiveMode: false,
    });
    onShowToast('API keys cleared.');
  };

  // Helper for progress bar colors
  const getProgressBarColor = (percentage: number, status: string) => {
    if (status === 'EXHAUSTED' || percentage >= 100) return 'bg-rose-500';
    if (status === 'WARNING' || percentage >= 75) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  const getStatusBadge = (status: string, percentage: number) => {
    if (status === 'EXHAUSTED' || percentage >= 100) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-300">
          <XCircle className="w-3 h-3" />
          Limit Reached
        </span>
      );
    }
    if (status === 'WARNING' || percentage >= 75) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
          <AlertTriangle className="w-3 h-3" />
          High Usage
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300">
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    );
  };

  const gemini31Model = quotaData?.models.find((m) => m.model === 'gemini-3.1-flash-lite');

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-2 border-slate-900 w-full max-w-3xl shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-emerald-500 text-slate-950 p-1.5 font-black">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm md:text-base font-black uppercase tracking-wider">
                  API Credentials & Quota Monitor
                </h2>
                <span className="bg-emerald-400 text-slate-950 text-[9px] font-black px-1.5 py-0.5 uppercase tracking-widest font-mono">
                  Live Quota Telemetry
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                Crustdata Sourcing • Gemini 3.1 Flash-Lite Engine
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b-2 border-slate-900 bg-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('credentials')}
            className={`flex-1 py-2.5 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 border-r-2 border-slate-900 transition-colors cursor-pointer ${
              activeTab === 'credentials'
                ? 'bg-white text-slate-900 border-b-2 border-b-white -mb-[2px]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            <span>Key Credentials & Setup</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quota')}
            className={`flex-1 py-2.5 px-4 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              activeTab === 'quota'
                ? 'bg-white text-slate-900 border-b-2 border-b-white -mb-[2px]'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Gemini Quota & Rate Limit Monitor</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-slate-900 flex-1">
          {/* TAB 1: CREDENTIALS */}
          {activeTab === 'credentials' && (
            <div className="space-y-4">
              {/* Quick Quota Teaser Bar */}
              <div className="bg-slate-900 text-white p-3 border-2 border-slate-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-emerald-400 text-slate-950 font-black">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                        Gemini 3.1 Flash-Lite Quota Live
                      </span>
                      <span className="text-[9px] font-mono text-slate-300 bg-slate-800 px-1.5 py-0.2">
                        Resets in {quotaData?.resetInFormatted || 'UTC midnight'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono">
                      Gemini 3.1 Flash-Lite: <span className="font-bold text-emerald-400">{gemini31Model?.remainingToday ?? 1500} requests remaining</span> of 1,500 RPD
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveTab('quota')}
                  className="bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-[11px] font-black uppercase px-3 py-1.5 flex items-center gap-1 cursor-pointer transition-all shrink-0"
                >
                  <span>View Quota Dashboard</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              {/* Status Action Bar with Verify API Keys button */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-100 border border-slate-300 p-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600 shrink-0" />
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">Credential Status & Endpoint Health</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {lastVerifiedAt ? `Last ping test: ${lastVerifiedAt}` : 'Not tested yet this session'}
                    </span>
                  </div>
                </div>

                <button
                  id="verify-api-keys-top-btn"
                  type="button"
                  onClick={handleVerifyApiKeys}
                  disabled={isVerifying}
                  className="border-2 border-slate-900 bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer disabled:opacity-50 transition-all active:translate-x-0.5 active:translate-y-0.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
                  <span>{isVerifying ? 'Verifying Endpoints...' : 'Verify API Keys'}</span>
                </button>
              </div>

              {/* Live Execution Mode Switch */}
              <div className="border-2 border-slate-900 bg-amber-50/60 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="bg-amber-400 text-slate-900 p-2 font-bold shrink-0 border border-slate-900">
                    <Zap className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <span className="text-xs font-black uppercase tracking-wider block text-slate-900">
                      Live API Execution Mode
                    </span>
                    <p className="text-[11px] text-slate-700 leading-tight mt-0.5">
                      When enabled, running the Python script makes real REST API calls to Crustdata for live candidate profiles and runs Gemini for reverse JD validation.
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer shrink-0 self-end sm:self-auto">
                  <span className="text-xs font-mono font-bold uppercase text-slate-800">
                    {isLiveMode ? 'LIVE MODE ON' : 'SIMULATION'}
                  </span>
                  <input
                    type="checkbox"
                    checked={isLiveMode}
                    onChange={(e) => setIsLiveMode(e.target.checked)}
                    className="w-5 h-5 accent-emerald-600 rounded-none cursor-pointer"
                  />
                </label>
              </div>

              {/* 1. CRUSTDATA API KEY FIELD */}
              <div className="border-2 border-slate-300 p-4 bg-slate-50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-slate-700" />
                    1. Crustdata API Key (Live Talent Sourcing)
                  </label>
                  <span className="text-[10px] font-mono text-slate-500 uppercase bg-slate-200 px-1.5 py-0.5 font-bold">
                    {crustdataKey ? 'Configured' : 'Live / Optional'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-snug">
                  Used by the Python script and live backend to query candidate profiles from Crustdata (<code className="bg-slate-200 px-1 py-0.5 font-mono text-[10px]">https://api.crustdata.com/person/search</code>).
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showCrustKey ? 'text' : 'password'}
                      value={crustdataKey}
                      onChange={(e) => setCrustdataKey(e.target.value)}
                      placeholder="e.g. cd_7159f75f1ad858dd408620a02f2f5a69dbb1"
                      className="w-full border-2 border-slate-900 px-3 py-2 text-xs font-mono bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCrustKey(!showCrustKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title={showCrustKey ? 'Hide key' : 'Show key'}
                    >
                      {showCrustKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Verification Result for Crustdata */}
                {testResults?.crustdata && (
                  <div
                    className={`p-2.5 border-2 text-xs font-mono flex items-start justify-between gap-2 ${
                      testResults.crustdata.valid
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : 'bg-red-50 border-red-500 text-red-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {testResults.crustdata.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold block">
                          Crustdata Endpoint: {testResults.crustdata.valid ? 'Active & Confirmed' : 'Verification Failed'}
                        </span>
                        <span className="text-[11px] opacity-90">{testResults.crustdata.message}</span>
                      </div>
                    </div>
                    {testResults.crustdata.latencyMs !== undefined && (
                      <span className="text-[10px] bg-white border border-slate-300 px-1.5 py-0.5 font-bold shrink-0">
                        {testResults.crustdata.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* 2. GEMINI API KEY FIELD */}
              <div className="border-2 border-slate-300 p-4 bg-slate-50 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-slate-700" />
                    2. Gemini API Key (Reverse JD AI Validator)
                  </label>
                  <span className="text-[10px] font-mono text-emerald-700 bg-emerald-100 px-1.5 py-0.5 border border-emerald-300 font-bold uppercase">
                    Server Key Active
                  </span>
                </div>

                <p className="text-[11px] text-slate-600 leading-snug">
                  Powers deep semantic candidate evaluation against technical JDs exclusively via <code className="bg-slate-200 px-1 py-0.5 font-mono text-[10px]">gemini-3.1-flash-lite</code> (with 1,500 daily requests & 15 RPM on Google AI Studio free tier). You can provide a custom key or use the automatically configured runtime key.
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type={showGeminiKey ? 'text' : 'password'}
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      placeholder="AIzaSy... (Leave empty to use automatic AI Studio key)"
                      className="w-full border-2 border-slate-900 px-3 py-2 text-xs font-mono bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGeminiKey(!showGeminiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                      title={showGeminiKey ? 'Hide key' : 'Show key'}
                    >
                      {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Verification Result for Gemini */}
                {testResults?.gemini && (
                  <div
                    className={`p-2.5 border-2 text-xs font-mono flex items-start justify-between gap-2 ${
                      testResults.gemini.valid
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                        : 'bg-red-50 border-red-500 text-red-900'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {testResults.gemini.valid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                      )}
                      <div>
                        <span className="font-bold block">
                          Gemini Validator: {testResults.gemini.valid ? 'Active & Confirmed' : 'Verification Note / Limit'}
                        </span>
                        <span className="text-[11px] opacity-90">{testResults.gemini.message}</span>
                      </div>
                    </div>
                    {testResults.gemini.latencyMs !== undefined && (
                      <span className="text-[10px] bg-white border border-slate-300 px-1.5 py-0.5 font-bold shrink-0">
                        {testResults.gemini.latencyMs}ms
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: REAL-TIME GEMINI QUOTA MONITOR */}
          {activeTab === 'quota' && (
            <div className="space-y-5">
              {/* Telemetry Control Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 text-white p-4 border-2 border-slate-900">
                <div className="flex items-center gap-3">
                  <div className="bg-emerald-400 text-slate-950 p-2 font-bold shrink-0">
                    <Activity className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-white">
                        Google AI Studio Free Tier Quota Engine
                      </span>
                      <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-400/40 text-[9px] font-mono px-1.5 py-0.2">
                        LIVE TELEMETRY
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 font-mono">
                      Daily limits reset at <span className="font-bold text-white">00:00 UTC</span> • Next reset in: <span className="font-bold text-emerald-400">{quotaData?.resetInFormatted || 'calculating...'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={fetchQuotaData}
                    disabled={isLoadingQuota}
                    className="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Refresh quota telemetry"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingQuota ? 'animate-spin' : ''}`} />
                    <span>Sync</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetQuota}
                    disabled={isResettingQuota}
                    className="border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1.5 text-xs font-mono flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="Reset local daily session counter"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Count</span>
                  </button>
                </div>
              </div>

              {/* 429 Quota Warning Callout if occurred */}
              {quotaData?.lastRateLimitError && (
                <div className="bg-rose-50 border-2 border-rose-500 p-3.5 flex items-start gap-3 text-rose-950">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1">
                    <span className="font-black uppercase tracking-wider block text-rose-900">
                      Rate Limit / 429 Notice: {quotaData.lastRateLimitError.model} Free Tier Limit Reached
                    </span>
                    <p className="text-[11px] text-rose-800 leading-snug">
                      Your Gemini key reached the Google AI Studio free tier limit for <code className="font-bold">{quotaData.lastRateLimitError.model}</code> (limit is 20 requests/day).
                    </p>
                    <div className="bg-white/80 border border-rose-300 p-2 font-mono text-[10px] text-rose-900">
                      🛡️ <span className="font-bold">Automated Safeguard Active:</span> The application automatically falls back to <span className="font-bold">Gemini 2.5 Flash</span> (1,500 daily requests) to ensure candidate evaluations continue smoothly.
                    </div>
                  </div>
                </div>
              )}

              {/* Key Summary Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 border-2 border-slate-900 p-3">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                    Total Requests Today
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black font-mono text-slate-900">
                      {quotaData?.totalRequestsToday ?? 0}
                    </span>
                    <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">
                      SESSION TOTAL
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border-2 border-slate-900 p-3">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                    Requests in Active Minute (RPM)
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-2xl font-black font-mono text-slate-900">
                      {quotaData?.currentRpmTotal ?? 0} <span className="text-xs text-slate-500 font-normal">/ 15 RPM</span>
                    </span>
                    <span className="text-[10px] font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 font-bold">
                      {(quotaData?.currentRpmTotal ?? 0) <= 5 ? 'LOW LOAD' : 'ACTIVE'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 border-2 border-slate-900 p-3">
                  <span className="text-[10px] font-mono text-slate-500 uppercase block font-bold">
                    Daily Quota Reset Clock
                  </span>
                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-lg font-black font-mono text-slate-900">
                      {quotaData?.resetInFormatted ?? '--'}
                    </span>
                    <span className="text-[10px] font-mono bg-slate-200 px-1.5 py-0.5 font-bold text-slate-700">
                      00:00 UTC
                    </span>
                  </div>
                </div>
              </div>

              {/* Models Quota & Progress Bars */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b-2 border-slate-900 pb-1.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-700" />
                    Model-by-Model Free Tier Quotas & Remaining Requests
                  </h3>
                  <span className="text-[10px] font-mono text-slate-500">
                    Real-time per-model trackers
                  </span>
                </div>

                <div className="space-y-3">
                  {quotaData?.models.map((model) => {
                    return (
                      <div
                        key={model.model}
                        className="border-2 border-emerald-500 bg-emerald-50/40 p-4 space-y-2.5 transition-all"
                      >
                        {/* Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase text-slate-900">
                              {model.displayName}
                            </span>
                            <span className="bg-emerald-600 text-white text-[9px] font-black uppercase px-1.5 py-0.2">
                              Active Engine
                            </span>
                            <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-mono font-bold px-1.5 py-0.2">
                              1,500 RPD Free Tier
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {getStatusBadge(model.status, model.usagePercentage)}
                            <span className="text-xs font-mono font-bold text-slate-700">
                              {model.usedToday} / {model.dailyLimit.toLocaleString()} RPD
                            </span>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-[11px] text-slate-600 font-mono leading-tight">
                          {model.description}
                        </p>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full bg-slate-200 border border-slate-400 h-3 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 ${getProgressBarColor(
                                model.usagePercentage,
                                model.status
                              )}`}
                              style={{ width: `${Math.max(2, Math.min(100, model.usagePercentage))}%` }}
                            />
                          </div>

                          {/* Remaining / Metrics Row */}
                          <div className="flex items-center justify-between text-[10px] font-mono">
                            <span className="text-slate-600 font-bold">
                              {model.remainingToday.toLocaleString()} requests remaining today
                            </span>
                            <span className="text-slate-500">
                              Usage: {model.usagePercentage}% • Limit: {model.rpmLimit} RPM / {model.tpmLimit.toLocaleString()} TPM
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Request Telemetry Stream */}
              <div className="border-2 border-slate-900 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-slate-700" />
                    Live Request History & Validation Log
                  </h4>
                  <span className="text-[10px] font-mono text-slate-500">
                    Latest 10 API executions
                  </span>
                </div>

                {quotaData?.recentHistory && quotaData.recentHistory.length > 0 ? (
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {quotaData.recentHistory.map((item) => (
                      <div
                        key={item.id}
                        className={`px-2.5 py-1.5 border flex items-center justify-between gap-2 ${
                          item.success
                            ? 'bg-white border-slate-300 text-slate-800'
                            : 'bg-rose-50 border-rose-300 text-rose-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              item.success ? 'bg-emerald-500' : 'bg-rose-500'
                            }`}
                          />
                          <span className="font-bold text-slate-900 truncate">{item.model}</span>
                          <span className="text-slate-400 text-[10px]">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.error ? (
                            <span className="text-[10px] text-rose-700 truncate max-w-[200px]" title={item.error}>
                              {item.error.includes('429') ? 'HTTP 429 Limit' : 'Error'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-700 font-bold">HTTP 200 OK</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-xs font-mono text-slate-500 bg-white border border-slate-300">
                    No requests logged yet this session. Click "Verify API Keys" or run candidate validation to record live telemetry.
                  </div>
                )}
              </div>

              {/* Free Tier Guide & Tips */}
              <div className="bg-slate-100 border border-slate-300 p-3.5 text-[11px] text-slate-700 space-y-1.5">
                <div className="flex items-center gap-1.5 font-bold text-slate-900 uppercase text-xs">
                  <Info className="w-4 h-4 text-slate-800" />
                  Understanding Google AI Studio Free Tier Quotas
                </div>
                <ul className="list-disc pl-4 space-y-1 text-slate-600">
                  <li>
                    <strong className="text-slate-800">Gemini 3.1 Flash-Lite:</strong> Primary dedicated engine offering <strong>1,500 requests per day</strong> and 15 RPM. Delivers ultra-low latency structured JSON candidate evaluations.
                  </li>
                  <li>
                    <strong className="text-slate-800">High-Volume Free Tier:</strong> 1,500 RPD and 1,000,000 TPM ensure seamless candidate processing without low daily request bottlenecks.
                  </li>
                  <li>
                    <strong className="text-slate-800">Need Pay-As-You-Go?</strong> Attaching billing on Google AI Studio enables higher rate limits with zero minimum deposit.
                  </li>
                </ul>
              </div>
            </div>
          )}

          {/* Quick Info & Security notice */}
          <div className="bg-slate-100 border border-slate-300 p-3 text-[11px] text-slate-600 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
            <p>
              Your credentials and live quota metrics are managed securely. The server uses automatic rate limiting and model fallbacks to prevent pipeline interruptions.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-100 border-t-2 border-slate-900 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              id="verify-api-keys-footer-btn"
              type="button"
              onClick={handleVerifyApiKeys}
              disabled={isVerifying}
              className="border-2 border-slate-900 bg-white hover:bg-slate-50 text-slate-900 px-3.5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer disabled:opacity-50 active:translate-x-0.5 active:translate-y-0.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Verifying Keys...' : 'Test & Ping Quota'}</span>
            </button>

            {activeTab === 'credentials' && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs text-red-600 hover:underline font-bold px-2 py-1 uppercase cursor-pointer"
              >
                Clear Keys
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-slate-400 bg-white text-slate-700 px-4 py-2 text-xs font-bold uppercase hover:bg-slate-50 cursor-pointer"
            >
              Close
            </button>

            <button
              type="button"
              onClick={handleSave}
              className="border-2 border-slate-900 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Save & Apply Credentials
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

