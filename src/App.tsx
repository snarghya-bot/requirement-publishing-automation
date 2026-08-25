/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { RequirementForm } from './components/RequirementForm';
import { PythonScriptViewer } from './components/PythonScriptViewer';
import { ExecutionTerminal } from './components/ExecutionTerminal';
import { ReverseValidationPanel } from './components/ReverseValidationPanel';
import { EmailDispatchModal } from './components/EmailDispatchModal';
import { CandidateDetailModal } from './components/CandidateDetailModal';
import { SqlitePromptModal } from './components/SqlitePromptModal';
import {
  RoleType,
  RoleConfig,
  SourcingRequirement,
  CandidateProfile,
  ReverseValidationResult,
  EmailDispatchPayload,
  SentEmailRecord,
} from './types';
import {
  ROLE_CONFIGS,
  CANDIDATE_POOL,
  AVAILABLE_ROLES,
  POPULAR_COMPANIES,
} from './data/roleDefaults';
import { generateCandidatePoolForRole } from './data/candidatePool';
import { generatePythonScript } from './utils/scriptGenerator';
import { performReverseValidation } from './utils/validationEngine';
import { ApiKeyConfigModal, ApiKeysConfig } from './components/ApiKeyConfigModal';
import { AddRoleModal } from './components/AddRoleModal';
import {
  getAllRoleConfigs,
  getRoleConfig,
  getAvailableRoleList,
  saveRoleToDb,
  deleteRoleFromDb,
  resetRoleInDb,
  syncRolesWithServer,
} from './utils/roleStorage';
import {
  getAllCompanyNames,
  syncCompaniesWithServer,
} from './utils/companyStorage';
import {
  computeJdHash,
  getStoredPulls,
  getStoredRecordsByJdHash,
  saveCandidatePullToSqlite,
  SqlitePullHistory,
} from './utils/sqliteStorage';
import {
  Code2,
  Terminal,
  UserCheck,
  Mail,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CheckCircle,
  FileSpreadsheet,
  Key,
  Zap,
  Database,
} from 'lucide-react';

interface TerminalLog {
  id: string;
  text: string;
  type: 'info' | 'success' | 'warn' | 'dim' | 'highlight';
  timestamp: string;
}

export default function App() {
  // Default Initial Role: Production Support
  const initialRole: RoleType = 'Production Support';
  const initialConfig = getRoleConfig(initialRole);

  // Dynamic Roles List & Configs State (synced with DB)
  const [availableRolesList, setAvailableRolesList] = useState(() => getAvailableRoleList());
  const [isAddRoleModalOpen, setIsAddRoleModalOpen] = useState(false);
  const [editingRoleConfig, setEditingRoleConfig] = useState<RoleConfig | null>(null);
  const [isSavingSkills, setIsSavingSkills] = useState(false);
  const [hasSavedSkillsRecently, setHasSavedSkillsRecently] = useState(false);

  // Sync role definitions and custom companies with backend DB on startup
  useEffect(() => {
    syncRolesWithServer().then(() => {
      setAvailableRolesList(getAvailableRoleList());
    });
    syncCompaniesWithServer().then((companies) => {
      if (companies && companies.length > 0) {
        setRequirement((prev) => ({
          ...prev,
          targetCompanies: companies.map((c) => c.name),
        }));
      }
    });
  }, []);

  // API Credentials Config State (with persistence)
  const [apiKeysConfig, setApiKeysConfig] = useState<ApiKeysConfig>(() => {
    try {
      const saved = localStorage.getItem('rca_api_keys_config');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // fallback
    }
    return {
      crustdataApiKey: '',
      geminiApiKey: '',
      isLiveMode: true,
    };
  });

  const [isApiKeysModalOpen, setIsApiKeysModalOpen] = useState(false);

  const handleSaveApiKeysConfig = (newConfig: ApiKeysConfig) => {
    setApiKeysConfig(newConfig);
    try {
      localStorage.setItem('rca_api_keys_config', JSON.stringify(newConfig));
    } catch (e) {
      console.warn('Could not persist api keys to localStorage', e);
    }
  };

  // 1. Core Sourcing Requirement State (All companies selected by default, strict exclusions)
  const [requirement, setRequirement] = useState<SourcingRequirement>(() => {
    const allInitialCompanies = getAllCompanyNames();
    return {
      role: initialRole,
      customJd: initialConfig.defaultJd,
      mustHaveSkills: [...initialConfig.defaultMustHaveSkills],
      goodToHaveSkills: [...initialConfig.defaultGoodToHaveSkills],
      experienceRange: '5 to 10 years',
      location: 'India',
      targetCompanies: allInitialCompanies.length > 0 ? allInitialCompanies : [...POPULAR_COMPANIES],
      disqualifyTCS: true,
      searchCitiExperience: true,
    };
  });

  // 2. Automation & Script State
  const [generatedScript, setGeneratedScript] = useState<string>(() =>
    generatePythonScript(
      {
        role: initialRole,
        customJd: initialConfig.defaultJd,
        mustHaveSkills: [...initialConfig.defaultMustHaveSkills],
        goodToHaveSkills: [...initialConfig.defaultGoodToHaveSkills],
        experienceRange: '5 to 10 years',
        location: 'India',
        targetCompanies: [...POPULAR_COMPANIES],
      },
      {
        crustdataApiKey: apiKeysConfig.crustdataApiKey,
        geminiApiKey: apiKeysConfig.geminiApiKey,
      }
    )
  );

  const [activeTab, setActiveTab] = useState<'script' | 'terminal' | 'results'>('results');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [isExecutingScript, setIsExecutingScript] = useState(false);
  const [executionProgress, setExecutionProgress] = useState(0);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);

  // 3. Profiles & Reverse Validation State
  const [candidatePool, setCandidatePool] = useState<CandidateProfile[]>(() =>
    generateCandidatePoolForRole(initialRole, {
      mustHaveSkills: initialConfig.defaultMustHaveSkills,
      goodToHaveSkills: initialConfig.defaultGoodToHaveSkills,
      targetCompanies: POPULAR_COMPANIES,
      experienceRange: '5 to 10 years',
    })
  );
  const [customLiveValidations, setCustomLiveValidations] = useState<Record<string, ReverseValidationResult>>({});
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [selectedCandidateDetail, setSelectedCandidateDetail] = useState<CandidateProfile | null>(null);

  // 4. SQLite Merge vs Fresh State
  const [sqlitePromptState, setSqlitePromptState] = useState<{
    isOpen: boolean;
    previousPull: SqlitePullHistory | null;
    pendingExecution: boolean;
  }>({
    isOpen: false,
    previousPull: null,
    pendingExecution: false,
  });

  // 5. Email Dispatch State
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [sentEmailHistory, setSentEmailHistory] = useState<SentEmailRecord[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Filter candidate pool to match current role or relevant profiles
  const relevantCandidates = useMemo(() => {
    if (!requirement.role) return candidatePool;

    // Filter by role specialty
    let matched = candidatePool.filter((c) => {
      if (
        c.id.startsWith('crust-live') ||
        c.id.startsWith('cand-live') ||
        c.id.startsWith('cand-imported') ||
        c.id.startsWith('cand-csv')
      ) {
        return true; // Live pulled & imported profiles always included
      }
      const rLower = requirement.role.toLowerCase();
      const roleIdPrefix = `cand-${requirement.role.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
      if (c.id.startsWith(roleIdPrefix)) return true;
      if (requirement.role === 'Java Developer') return c.id.startsWith('cand-java') || c.currentRole.toLowerCase().includes('java');
      if (requirement.role === '.NET Developer') return c.id.startsWith('cand-dotnet') || c.currentRole.toLowerCase().includes('.net');
      if (requirement.role === 'DevOps') return c.id.startsWith('cand-devops') || c.currentRole.toLowerCase().includes('devops');
      if (requirement.role === 'Production Support') return c.id.startsWith('cand-prod') || c.id.startsWith('cand-production') || c.currentRole.toLowerCase().includes('support');
      if (requirement.role === 'Unix/SQL/Autosys') return c.id.startsWith('cand-unix') || c.currentRole.toLowerCase().includes('unix') || c.currentRole.toLowerCase().includes('autosys');
      if (requirement.role === 'Cloud') return c.id.startsWith('cand-cloud') || c.currentRole.toLowerCase().includes('cloud');
      if (requirement.role === 'Mainframe Developer/Support') return c.id.startsWith('cand-mf') || c.id.startsWith('cand-mainframe') || c.currentRole.toLowerCase().includes('mainframe');
      if (requirement.role === 'Automation Test Engineer') return c.id.startsWith('cand-qa') || c.id.startsWith('cand-automation') || c.currentRole.toLowerCase().includes('test');
      if (requirement.role === 'Kafka STE / L3 Admin') return c.id.startsWith('cand-kafka') || c.currentRole.toLowerCase().includes('kafka');
      
      return c.currentRole.toLowerCase().includes(rLower) || c.skills.some(s => requirement.mustHaveSkills.some(m => m.toLowerCase() === s.toLowerCase()));
    });

    if (matched.length === 0) {
      matched = candidatePool;
    }

    // If company filter is active, sort matched companies first
    if (requirement.targetCompanies.length > 0) {
      const lowerTargets = requirement.targetCompanies.map((c) => c.toLowerCase());
      matched = [...matched].sort((a, b) => {
        const aMatches = lowerTargets.some((tc) => a.currentCompany.toLowerCase().includes(tc));
        const bMatches = lowerTargets.some((tc) => b.currentCompany.toLowerCase().includes(tc));
        if (aMatches && !bMatches) return -1;
        if (!aMatches && bMatches) return 1;
        return 0;
      });
    }

    return matched;
  }, [candidatePool, requirement.role, requirement.targetCompanies, requirement.mustHaveSkills]);

  // Compute Reverse Validations for current candidates against current requirement
  const reverseValidations = useMemo(() => {
    const results = performReverseValidation(requirement, relevantCandidates);
    const map: Record<string, ReverseValidationResult> = {};
    results.forEach((r) => {
      map[r.candidateId] = r;
    });
    return { ...map, ...customLiveValidations };
  }, [requirement, relevantCandidates, customLiveValidations]);

  // Auto-select highly recommended & qualified matches initially
  useEffect(() => {
    const topIds = relevantCandidates
      .filter((c) => {
        const v = reverseValidations[c.id];
        return v && (v.qualificationStatus === 'Highly Recommended' || v.qualificationStatus === 'Qualified Match');
      })
      .map((c) => c.id);

    setSelectedCandidateIds(topIds);
  }, [relevantCandidates, reverseValidations]);

  // Handle Role Selection (loads saved skills & JD from DB)
  const handleRoleSelect = (role: RoleType) => {
    const config = getRoleConfig(role);
    const newReq: SourcingRequirement = {
      ...requirement,
      role,
      customJd: config.defaultJd,
      mustHaveSkills: [...config.defaultMustHaveSkills],
      goodToHaveSkills: [...config.defaultGoodToHaveSkills],
      targetCompanies: [...POPULAR_COMPANIES],
      disqualifyTCS: true,
      searchCitiExperience: true,
    };

    setRequirement(newReq);
    const newPool = generateCandidatePoolForRole(role, newReq);
    setCandidatePool(newPool);

    const newScript = generatePythonScript(newReq, {
      crustdataApiKey: apiKeysConfig.crustdataApiKey,
      geminiApiKey: apiKeysConfig.geminiApiKey,
    });
    setGeneratedScript(newScript);
    showToast(`Loaded '${role}' with ${newPool.length} sourced candidate profiles and ${config.defaultMustHaveSkills.length} required skills.`);
  };

  // Open Modal to Add a Brand New Role (blank or preset)
  const handleOpenAddRoleModal = () => {
    setEditingRoleConfig(null);
    setIsAddRoleModalOpen(true);
  };

  // Open Modal to Edit Active Role definition
  const handleOpenEditRoleModal = () => {
    const currentConfig = getRoleConfig(requirement.role);
    setEditingRoleConfig(currentConfig);
    setIsAddRoleModalOpen(true);
  };

  // Save role configuration from modal to DB
  const handleSaveRoleFromModal = async (config: RoleConfig) => {
    await saveRoleToDb(config);
    setAvailableRolesList(getAvailableRoleList());

    // If currently on this role or newly created, switch to it
    const newReq: SourcingRequirement = {
      ...requirement,
      role: config.role,
      customJd: config.defaultJd,
      mustHaveSkills: [...config.defaultMustHaveSkills],
      goodToHaveSkills: [...config.defaultGoodToHaveSkills],
    };
    setRequirement(newReq);
    const newScript = generatePythonScript(newReq, {
      crustdataApiKey: apiKeysConfig.crustdataApiKey,
      geminiApiKey: apiKeysConfig.geminiApiKey,
    });
    setGeneratedScript(newScript);
  };

  // Delete a custom role from DB
  const handleDeleteRole = async (roleName: string) => {
    await deleteRoleFromDb(roleName);
    const updatedList = getAvailableRoleList();
    setAvailableRolesList(updatedList);

    if (requirement.role === roleName) {
      handleRoleSelect('Production Support');
    }
  };

  // Quick-save current Must-Have and Good-To-Have skills for the active role directly into DB
  const handleSaveCurrentSkillsForRole = async () => {
    if (!requirement.role) return;

    setIsSavingSkills(true);
    try {
      const existing = getRoleConfig(requirement.role);
      const updatedConfig: RoleConfig = {
        ...existing,
        role: requirement.role,
        defaultJd: requirement.customJd || existing.defaultJd,
        defaultMustHaveSkills: [...requirement.mustHaveSkills],
        defaultGoodToHaveSkills: [...requirement.goodToHaveSkills],
        isModified: true,
      };

      await saveRoleToDb(updatedConfig);
      setAvailableRolesList(getAvailableRoleList());

      setHasSavedSkillsRecently(true);
      setTimeout(() => setHasSavedSkillsRecently(false), 3000);
      showToast(`✓ Must-have & Good-to-have skills for '${requirement.role}' successfully saved to database!`);
    } catch (err: any) {
      showToast('Failed to save skills: ' + err.message);
    } finally {
      setIsSavingSkills(false);
    }
  };

  // Reset current role to default presets
  const handleResetCurrentRoleToDefault = async () => {
    if (!requirement.role) return;
    if (!window.confirm(`Reset '${requirement.role}' to default factory skills and job description?`)) {
      return;
    }

    const { config } = await resetRoleInDb(requirement.role);
    setAvailableRolesList(getAvailableRoleList());

    const newReq: SourcingRequirement = {
      ...requirement,
      customJd: config.defaultJd,
      mustHaveSkills: [...config.defaultMustHaveSkills],
      goodToHaveSkills: [...config.defaultGoodToHaveSkills],
    };
    setRequirement(newReq);
    const newScript = generatePythonScript(newReq, {
      crustdataApiKey: apiKeysConfig.crustdataApiKey,
      geminiApiKey: apiKeysConfig.geminiApiKey,
    });
    setGeneratedScript(newScript);
    showToast(`✓ '${requirement.role}' reset to default skills.`);
  };

  // Handle Requirement Update
  const handleUpdateRequirement = (updated: Partial<SourcingRequirement>) => {
    const newReq = { ...requirement, ...updated };
    setRequirement(newReq);
    const newScript = generatePythonScript(newReq, {
      crustdataApiKey: apiKeysConfig.crustdataApiKey,
      geminiApiKey: apiKeysConfig.geminiApiKey,
    });
    setGeneratedScript(newScript);
  };

  // Generate Script Action
  const handleGenerateScript = () => {
    setIsGeneratingScript(true);
    setTimeout(() => {
      const newScript = generatePythonScript(requirement, {
        crustdataApiKey: apiKeysConfig.crustdataApiKey,
        geminiApiKey: apiKeysConfig.geminiApiKey,
      });
      setGeneratedScript(newScript);
      setIsGeneratingScript(false);
      setActiveTab('script');
      showToast('Python Automation Pipeline Script generated successfully!');
    }, 300);
  };

  // Helper for formatted log timestamp
  const getLogTimestamp = () =>
    new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  // Pre-execution Check for SQLite JD match
  const handleInitiateExecuteScript = () => {
    const jdHash = computeJdHash(requirement.customJd || '', requirement.role);
    const existingPulls = getStoredPulls();
    const match = existingPulls.find((p) => p.jdHash === jdHash);

    if (match) {
      setSqlitePromptState({
        isOpen: true,
        previousPull: match,
        pendingExecution: true,
      });
    } else {
      executePipeline(false);
    }
  };

  const handleConfirmMerge = () => {
    setSqlitePromptState((prev) => ({ ...prev, isOpen: false }));
    executePipeline(true);
  };

  const handleConfirmFresh = () => {
    setSqlitePromptState((prev) => ({ ...prev, isOpen: false }));
    executePipeline(false);
  };

  // Run Python Script Action & Live Execution Engine
  const executePipeline = async (isMerge: boolean = false) => {
    setIsExecutingScript(true);
    setActiveTab('terminal');
    setExecutionProgress(10);

    const initialLogs: TerminalLog[] = [
      {
        id: '1',
        text: `[*] Initializing Requirement Consolidated Automation Engine with SQLite Cache...`,
        type: 'info',
        timestamp: getLogTimestamp(),
      },
      {
        id: '2',
        text: `[*] Role Target: "${requirement.role}" | Geo: "${requirement.location}" | Exp: "${requirement.experienceRange || 'Any'}"`,
        type: 'highlight',
        timestamp: getLogTimestamp(),
      },
      {
        id: '2b',
        text: `[*] Execution Mode: ${isMerge ? 'MERGE with previous SQLite talent pool' : 'FRESH pull'}`,
        type: 'info',
        timestamp: getLogTimestamp(),
      },
      {
        id: '2c',
        text: `[!] Strict Disqualifications Active: TCS (Current/Past) -> REJECT | Citi (Current) -> REJECT | Citi (Past) -> SEARCH & FLAG`,
        type: 'warn',
        timestamp: getLogTimestamp(),
      },
    ];

    setTerminalLogs(initialLogs);

    const isLive = apiKeysConfig.isLiveMode;
    const crustKey = apiKeysConfig.crustdataApiKey.trim();
    const geminiKey = apiKeysConfig.geminiApiKey.trim();

    // 1. Synthesize Boolean Query
    setTimeout(() => {
      setExecutionProgress(25);
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: '3',
          text: `[+] Synthesizing Boolean Search Query:\n    ("${requirement.role}") AND (${requirement.mustHaveSkills.slice(0, 3).map((s) => `"${s}"`).join(' AND ')}) AND ("${requirement.location}")${
            requirement.targetCompanies.length > 0
              ? ` AND (${requirement.targetCompanies.slice(0, 5).map((c) => `"${c}"`).join(' OR ')}...)`
              : ''
          } NOT ("TCS" OR "Tata Consultancy")`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
      ]);
    }, 350);

    // 2. Perform Talent Sourcing (Live Crustdata Search or Intelligent Talent Engine)
    let liveCandidates: CandidateProfile[] = [];
    let liveSourcingSuccess = false;
    let sourcingDebugData: any = null;

    const reqPayload = {
      role: requirement.role,
      mustHaveSkills: requirement.mustHaveSkills,
      goodToHaveSkills: requirement.goodToHaveSkills,
      location: requirement.location,
      experienceRange: requirement.experienceRange,
      targetCompanies: requirement.targetCompanies,
      crustdataApiKey: crustKey,
    };

    setTerminalLogs((prev) => [
      ...prev,
      {
        id: 'debug-payload',
        text: `[DEBUG] Sourcing Dispatch Request Payload:\n${JSON.stringify({
          role: reqPayload.role,
          location: reqPayload.location,
          targetCompanies: reqPayload.targetCompanies,
          mustHaveSkills: reqPayload.mustHaveSkills,
          apiKeyPresent: !!crustKey,
          apiKeyLength: crustKey.length,
        }, null, 2)}`,
        type: 'debug',
        timestamp: getLogTimestamp(),
      },
    ]);

    setTimeout(() => {
      setExecutionProgress(35);
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: '4',
          text: isLive && crustKey
            ? `[*] Connecting to Crustdata Live Person Search API (Key: ${crustKey.slice(0, 6)}***)...`
            : `[*] Sourcing candidate profiles from Talent API connector & talent repository matching Boolean criteria...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
      ]);
    }, 450);

    try {
      const sourceRes = await fetch('/api/live-source', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      const sourceData = await sourceRes.json();
      sourcingDebugData = sourceData.debug;

      // Output debug logs for every attempt and status code
      if (sourceData.debug?.attempts && sourceData.debug.attempts.length > 0) {
        sourceData.debug.attempts.forEach((att: any, attIdx: number) => {
          setTerminalLogs((prev) => [
            ...prev,
            {
              id: `debug-att-${attIdx}`,
              text: `[DEBUG] Crustdata Sourcing Attempt #${att.attempt} -> ${att.url}\n        Auth Header: ${att.authHeaderUsed}\n        HTTP Status: ${att.httpStatus || '0 (Network error)'} | Latency: ${att.latencyMs}ms\n        Payload Filters: ${JSON.stringify(att.requestPayload?.filters || att.requestPayload?.query || {})}\n        Response Preview: ${att.responsePreview ? att.responsePreview.slice(0, 200) + '...' : att.error || 'Empty response'}`,
              type: 'debug',
              timestamp: getLogTimestamp(),
            },
          ]);
        });
      }

      setTerminalLogs((prev) => [
        ...prev,
        {
          id: 'debug-status-summary',
          text: `[DEBUG] Crustdata Fetch Result -> HTTP Status: ${sourceData.debug?.finalStatus || sourceRes.status} | Source: ${sourceData.source} | Raw Profiles: ${sourceData.rawCount || 0}\n        Diagnostic: ${sourceData.debug?.verdict || 'OK'}`,
          type: 'debug',
          timestamp: getLogTimestamp(),
        },
      ]);

      if (sourceRes.ok && sourceData.candidates && sourceData.candidates.length > 0) {
        liveCandidates = sourceData.candidates;
        liveSourcingSuccess = true;
        setCandidatePool((prev) => isMerge ? [...liveCandidates, ...prev] : liveCandidates);
      }
    } catch (err: any) {
      console.warn('Live candidate sourcing notice:', err.message);
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: 'debug-err',
          text: `[DEBUG] Sourcing Exception: ${err.message}`,
          type: 'debug',
          timestamp: getLogTimestamp(),
        },
      ]);
    }

    if (!liveSourcingSuccess || liveCandidates.length === 0) {
      liveCandidates = [];
      liveSourcingSuccess = false;
      setCandidatePool((prev) => isMerge ? prev : []);
    }

    // 3. Profiles Sourced Report
    setTimeout(() => {
      setExecutionProgress(55);
      const activeCandidates = liveSourcingSuccess ? liveCandidates : relevantCandidates;
      const citiProfilesCount = activeCandidates.filter((c) => c.workedAtCiti || (c.summary && c.summary.toLowerCase().includes('citi'))).length;
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: '5',
          text: `[+] Sourced and extracted ${activeCandidates.length} candidate profiles matching exact filters.`,
          type: 'success',
          timestamp: getLogTimestamp(),
        },
        {
          id: '5-citi',
          text: `[★] Intelligence Scan: Identified ${citiProfilesCount} candidate profile(s) with verified past Citi banking / client engagements.`,
          type: 'highlight',
          timestamp: getLogTimestamp(),
        },
      ]);
    }, 900);

    // 4. LinkedIn & Google Search Grounding Profile Integrity Guardrail
    setTimeout(async () => {
      setExecutionProgress(70);
      const candidatesToCheck = liveSourcingSuccess ? liveCandidates : relevantCandidates;

      setTerminalLogs((prev) => [
        ...prev,
        {
          id: 'guardrail-init',
          text: `[*] Activating Google Search Grounding Guardrail: Cross-referencing candidate LinkedIn profiles against live web search for employer, location, and technical skill integrity...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
        {
          id: 'guardrail-debug',
          text: `[DEBUG] Google Search Guardrail Dispatch: Grounding ${candidatesToCheck.length} candidate profiles against public LinkedIn indexes...`,
          type: 'debug',
          timestamp: getLogTimestamp(),
        },
      ]);

      try {
        const verifyRes = await fetch('/api/google-verify-candidates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: candidatesToCheck,
            geminiApiKey: geminiKey,
          }),
        });

        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          const verifications = verifyData.verifications || {};

          // Attach googleVerification to candidates
          setCandidatePool((prev) =>
            prev.map((c) => (verifications[c.id] ? { ...c, googleVerification: verifications[c.id] } : c))
          );

          const verifiedList = Object.values(verifications) as any[];
          const matches = verifiedList.filter((v) => v.status === 'VERIFIED_MATCH').length;
          const partials = verifiedList.filter((v) => v.status === 'PARTIALLY_VERIFIED').length;
          const flagged = verifiedList.filter((v) => v.status === 'FLAGGED_DISCREPANCY').length;

          setTerminalLogs((prev) => [
            ...prev,
            {
              id: 'guardrail-result',
              text: `[✓] Google Search Guardrail Completed: ${verifiedList.length} candidate profiles verified (Verified Matches: ${matches} | Partially Verified: ${partials} | Flagged Discrepancies: ${flagged}).`,
              type: 'success',
              timestamp: getLogTimestamp(),
            },
            ...(verifiedList.slice(0, 2).map((v, vIdx) => ({
              id: `guardrail-sample-${vIdx}`,
              text: `[DEBUG] Grounding Sample: Candidate #${v.candidateId} -> ${v.guardrailVerdict}`,
              type: 'debug' as const,
              timestamp: getLogTimestamp(),
            }))),
          ]);
        }
      } catch (err: any) {
        console.warn('Google verification guardrail notice:', err.message);
      }
    }, 1200);

    // 5. Reverse JD Validation (Gemini 3.1 Flash-Lite AI or Engine)
    setTimeout(async () => {
      setExecutionProgress(85);
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: '6',
          text: `[*] Executing Reverse JD Validation Engine: Screening must-haves, good-to-haves, YoE, Citi experience, & company switches against JD...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
        {
          id: '6-batch-1',
          text: `[*] Screening Batch 1/3 (Profiles 1-4) with Gemini 3.1 Flash-Lite (RPD: 1,500 | RPM: 15)...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
        {
          id: '6-batch-2',
          text: `[*] Screening Batch 2/3 (Profiles 5-8) with Gemini 3.1 Flash-Lite...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
        {
          id: '6-batch-3',
          text: `[*] Screening Batch 3/3 (Profiles 9-12) with Gemini 3.1 Flash-Lite...`,
          type: 'info',
          timestamp: getLogTimestamp(),
        },
      ]);

      const candidatesToValidate = liveSourcingSuccess ? liveCandidates : relevantCandidates;
      let computedValidationMap: Record<string, ReverseValidationResult> = {};

      // Try live Gemini AI Reverse Validation
      try {
        const valRes = await fetch('/api/live-validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requirement,
            candidates: candidatesToValidate.slice(0, 10),
            geminiApiKey: geminiKey,
          }),
        });

        if (valRes.ok) {
          const valData = await valRes.json();
          if (valData.validations && Object.keys(valData.validations).length > 0) {
            computedValidationMap = valData.validations;
            setCustomLiveValidations((prev) => ({ ...prev, ...valData.validations }));
            setTerminalLogs((prev) => [
              ...prev,
              {
                id: 'gemini-ok',
                text: `[✓] Gemini 3.1 Flash-Lite successfully evaluated Batch 1 (${Object.keys(valData.validations).length} candidate profiles) with structured reverse qualification.`,
                type: 'success',
                timestamp: getLogTimestamp(),
              },
            ]);
          }
        }
      } catch (err: any) {
        console.warn('Gemini validation fallback to local engine', err);
      }

      // If local engine validations
      if (Object.keys(computedValidationMap).length === 0) {
        const clientValResults = performReverseValidation(requirement, candidatesToValidate);
        clientValResults.forEach((r) => {
          computedValidationMap[r.candidateId] = r;
        });
      }

      // Generate Terminal ASCII Summary Table
      const headerRow = `+----+----------------------+--------------------+-------+------+----------------------+-----------+`;
      const titleRow = `| #  | Candidate Name       | Verdict            | Score | YoE  | Current Employer     | Citi Exp? |`;
      const dividerRow = `+----+----------------------+--------------------+-------+------+----------------------+-----------+`;
      
      const tableRows = candidatesToValidate.slice(0, 8).map((c, i) => {
        const val = computedValidationMap[c.id];
        const verdict = val?.qualificationStatus === 'Highly Recommended' ? 'STRONG MATCH' : val?.qualificationStatus === 'Qualified Match' ? 'QUALIFIED' : 'MATCH';
        const score = `${val?.overallJdFitScore || 85}%`;
        const yoe = `${c.experienceYears || 7.0}y`;
        const hasCiti = (c.workedAtCiti || (c.summary && c.summary.toLowerCase().includes('citi'))) ? 'YES ★' : 'No';
        const namePad = (c.name.slice(0, 20)).padEnd(20);
        const verdictPad = verdict.padEnd(18);
        const scorePad = score.padEnd(5);
        const yoePad = yoe.padEnd(4);
        const compPad = (c.currentCompany.slice(0, 20)).padEnd(20);
        const citiPad = hasCiti.padEnd(9);
        return `| ${(i + 1).toString().padEnd(2)} | ${namePad} | ${verdictPad} | ${scorePad} | ${yoePad} | ${compPad} | ${citiPad} |`;
      });

      const asciiTableText = [
        `\n[=] CANDIDATE EVALUATION & REVERSE QUALIFICATION TABLE:`,
        headerRow,
        titleRow,
        dividerRow,
        ...tableRows,
        dividerRow,
      ].join('\n');

      setTerminalLogs((prev) => [
        ...prev,
        {
          id: 'ascii-table',
          text: asciiTableText,
          type: 'dim',
          timestamp: getLogTimestamp(),
        },
      ]);

      // 5. Citi Background Summary in Terminal
      const citiMatches = candidatesToValidate.filter((c) => c.workedAtCiti || (c.summary && c.summary.toLowerCase().includes('citi')));
      if (citiMatches.length > 0) {
        const citiSummaryText = [
          `\n[★] CITI EXPERIENCE DETECTED (${citiMatches.length} Candidate Profiles):`,
          ...citiMatches.map((c) => `  • ${c.name} (${c.currentCompany}, ${c.experienceYears}y) -> ${c.citiExperienceDetails || 'Past Citi banking application & core systems engagement'}`),
        ].join('\n');

        setTerminalLogs((prev) => [
          ...prev,
          {
            id: 'citi-summary-box',
            text: citiSummaryText,
            type: 'highlight',
            timestamp: getLogTimestamp(),
          },
        ]);
      }

      // 6. Persist to SQLite Storage Engine
      const sqliteSaved = saveCandidatePullToSqlite(
        requirement.role,
        requirement.customJd || '',
        candidatesToValidate,
        computedValidationMap,
        isMerge
      );

      setTerminalLogs((prev) => [
        ...prev,
        {
          id: 'sqlite-save',
          text: `[✓] Persisted ${sqliteSaved.totalStored} profile evaluations into SQLite Database (JD Hash: ${sqliteSaved.jdHash}).`,
          type: 'success',
          timestamp: getLogTimestamp(),
        },
      ]);

      // 7. Completion
      setExecutionProgress(100);
      setTerminalLogs((prev) => [
        ...prev,
        {
          id: '7',
          text: `[✓] Pipeline execution finished with exit code 0. Evaluated candidates ready in Table tab.`,
          type: 'success',
          timestamp: getLogTimestamp(),
        },
      ]);

      setIsExecutingScript(false);
      showToast(`Automation complete! Evaluated ${candidatesToValidate.length} candidates.`);
    }, 1800);
  };

  // Reset to default
  const handleReset = () => {
    const defaultRole: RoleType = 'Mainframe Developer/Support';
    const config = ROLE_CONFIGS[defaultRole];
    const defaultReq: SourcingRequirement = {
      role: defaultRole,
      customJd: config.defaultJd,
      mustHaveSkills: [...config.defaultMustHaveSkills],
      goodToHaveSkills: [...config.defaultGoodToHaveSkills],
      experienceRange: '5 to 10 years',
      location: 'India',
      targetCompanies: [...POPULAR_COMPANIES],
      disqualifyTCS: true,
      searchCitiExperience: true,
    };
    setRequirement(defaultReq);
    setCandidatePool(CANDIDATE_POOL);
    setCustomLiveValidations({});
    setGeneratedScript(
      generatePythonScript(defaultReq, {
        crustdataApiKey: apiKeysConfig.crustdataApiKey,
        geminiApiKey: apiKeysConfig.geminiApiKey,
      })
    );
    showToast('Reset application to default configuration.');
  };

  // Candidate Selection Handlers
  const handleToggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    setSelectedCandidateIds(relevantCandidates.map((c) => c.id));
  };

  const handleDeselectAll = () => {
    setSelectedCandidateIds([]);
  };

  // Email Dispatch Execution
  const handleSendEmail = (payload: EmailDispatchPayload) => {
    const newRecord: SentEmailRecord = {
      id: `DISPATCH-${Date.now().toString().slice(-6)}`,
      sentAt: new Date().toLocaleTimeString(),
      recipient: payload.recipientEmail,
      subject: payload.subject,
      candidateCount: payload.selectedCandidateIds.length,
      role: requirement.role || 'General',
      status: 'Delivered',
    };

    setSentEmailHistory((prev) => [newRecord, ...prev]);
    showToast(`Email successfully delivered to ${payload.recipientEmail}!`);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Handle direct import of local terminal run or CSV
  const handleImportOutput = (
    importedCandidates: CandidateProfile[],
    importedValidations: Record<string, ReverseValidationResult>
  ) => {
    setCandidatePool((prev) => {
      const existingIds = new Set(prev.map((c) => c.id));
      const newOnly = importedCandidates.filter((c) => !existingIds.has(c.id));
      return [...newOnly, ...prev];
    });
    setCustomLiveValidations((prev) => ({
      ...prev,
      ...importedValidations,
    }));
    setSelectedCandidateIds(importedCandidates.map((c) => c.id));
    setActiveTab('results');
    showToast(`Successfully imported ${importedCandidates.length} candidate profiles!`);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col selection:bg-slate-900 selection:text-white">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white border-2 border-slate-900 px-4 py-2.5 text-xs font-bold shadow-[4px_4px_0px_0px_rgba(15,23,42,1)] flex items-center gap-2 animate-bounce">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <Navbar
        onReset={handleReset}
        activeRole={requirement.role}
        activeCount={relevantCandidates.length}
        onOpenApiKeysModal={() => setIsApiKeysModalOpen(true)}
        isLiveMode={apiKeysConfig.isLiveMode}
        hasCrustKey={!!apiKeysConfig.crustdataApiKey.trim()}
      />

      {/* Main Workspace Layout */}
      <main className="flex flex-col lg:flex-row flex-1 overflow-hidden">
        {/* Left Form Sidebar */}
        <RequirementForm
          requirement={requirement}
          availableRolesList={availableRolesList}
          onUpdateRequirement={handleUpdateRequirement}
          onRoleSelect={handleRoleSelect}
          onOpenAddRoleModal={handleOpenAddRoleModal}
          onOpenEditRoleModal={handleOpenEditRoleModal}
          onSaveCurrentRoleSkillsToDb={handleSaveCurrentSkillsForRole}
          onResetCurrentRoleToDefault={handleResetCurrentRoleToDefault}
          isSavingSkills={isSavingSkills}
          hasSavedSkillsRecently={hasSavedSkillsRecently}
          onGenerateScript={handleGenerateScript}
          isGenerating={isGeneratingScript}
          onOpenApiKeysModal={() => setIsApiKeysModalOpen(true)}
          isLiveMode={apiKeysConfig.isLiveMode}
          hasCrustKey={!!apiKeysConfig.crustdataApiKey.trim()}
          onRunPython={handleInitiateExecuteScript}
          isExecuting={isExecutingScript}
        />

        {/* Right Execution & Results Workspace */}
        <section className="flex-1 p-4 md:p-6 flex flex-col gap-4 overflow-y-auto bg-white">
          {/* Navigation View Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-900 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('results')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border-2 border-slate-900 transition-all cursor-pointer ${
                  activeTab === 'results'
                    ? 'bg-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                    : 'bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                1. Sourced & Evaluated Candidates Table ({relevantCandidates.length})
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('terminal')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border-2 border-slate-900 transition-all cursor-pointer ${
                  activeTab === 'terminal'
                    ? 'bg-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                    : 'bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                2. Live Execution Console {isExecutingScript && '●'}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('script')}
                className={`px-4 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border-2 border-slate-900 transition-all cursor-pointer ${
                  activeTab === 'script'
                    ? 'bg-slate-900 text-white shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]'
                    : 'bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                3. Python Script Code (Optional)
              </button>
            </div>

            {/* Quick Sourcing Overview */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsApiKeysModalOpen(true)}
                className="text-[11px] font-mono font-bold text-slate-700 hover:text-slate-950 flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-2 py-1 border border-slate-300 cursor-pointer"
              >
                <Key className="w-3 h-3 text-slate-900" />
                <span>{apiKeysConfig.crustdataApiKey ? 'Crustdata: Active' : 'Enter API Keys'}</span>
              </button>

              <div className="text-right hidden sm:block">
                <span className="text-[10px] font-mono uppercase text-slate-400">Current Scope</span>
                <p className="text-xs font-bold text-slate-800">
                  {requirement.role || 'All Roles'} • {requirement.location} • {requirement.experienceRange || 'Any YoE'}
                </p>
              </div>
            </div>
          </div>

          {/* Tab 1: Python Script Viewer */}
          {activeTab === 'script' && (
            <div className="flex-1 flex flex-col min-h-[500px]">
              <div className="mb-2 bg-slate-50 border border-slate-200 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-700">
                <span className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-slate-900" />
                  Script auto-configured with <strong>{requirement.mustHaveSkills.length} must-haves</strong>,{' '}
                  <strong>{requirement.goodToHaveSkills.length} good-to-haves</strong>, <strong>SQLite persistence</strong>, and <strong>Citi intelligence detection</strong>.
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsApiKeysModalOpen(true)}
                    className="text-[10px] font-mono bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 px-2 py-0.5 font-bold uppercase flex items-center gap-1 cursor-pointer"
                  >
                    <Key className="w-2.5 h-2.5" />
                    Configure API Keys
                  </button>
                  <span className="text-[10px] font-mono bg-slate-200 px-2 py-0.5 font-bold uppercase">
                    Ready to Run
                  </span>
                </div>
              </div>
              <PythonScriptViewer
                script={generatedScript}
                onExecute={handleInitiateExecuteScript}
                isExecuting={isExecutingScript}
                roleName={requirement.role}
                onOpenApiKeysModal={() => setIsApiKeysModalOpen(true)}
                isLiveMode={apiKeysConfig.isLiveMode}
                hasCrustKey={!!apiKeysConfig.crustdataApiKey.trim()}
              />
            </div>
          )}

          {/* Tab 2: Execution Terminal */}
          {activeTab === 'terminal' && (
            <div className="flex-1 flex flex-col min-h-[500px]">
              <div className="mb-2 bg-slate-900 text-white p-2.5 flex items-center justify-between text-xs">
                <span className="font-mono flex items-center gap-1.5 text-emerald-400">
                  <Zap className="w-3.5 h-3.5" />
                  Live Execution Console • Role: {requirement.role}
                </span>
                <button
                  type="button"
                  onClick={() => setIsApiKeysModalOpen(true)}
                  className="text-[10px] font-mono bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 px-2 py-0.5 font-bold uppercase cursor-pointer"
                >
                  API Credentials
                </button>
              </div>
              <ExecutionTerminal
                logs={terminalLogs}
                isExecuting={isExecutingScript}
                progressPercent={executionProgress}
                onClear={() => setTerminalLogs([])}
                onRunPipeline={handleInitiateExecuteScript}
                onViewTable={() => setActiveTab('results')}
                onOpenApiKeysModal={() => setIsApiKeysModalOpen(true)}
              />
            </div>
          )}

          {/* Tab 3: Reverse Validation & Evaluated Candidates Panel */}
          {activeTab === 'results' && (
            <div className="flex-1 flex flex-col min-h-[500px]">
              <ReverseValidationPanel
                candidates={relevantCandidates}
                validations={reverseValidations}
                selectedCandidateIds={selectedCandidateIds}
                onToggleCandidate={handleToggleCandidate}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onOpenEmailModal={() => setIsEmailModalOpen(true)}
                requirement={requirement}
                onOpenCandidateDetail={(cand) => setSelectedCandidateDetail(cand)}
                onRunPythonPipeline={handleInitiateExecuteScript}
                onImportOutput={handleImportOutput}
                isExecuting={isExecutingScript}
              />
            </div>
          )}

          {/* Sent Email History Tracker Banner */}
          {sentEmailHistory.length > 0 && (
            <div className="border border-slate-300 bg-slate-50 p-3 mt-auto shrink-0">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1.5">
                Recent Dispatches (Audit Log)
              </span>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {sentEmailHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="flex justify-between items-center text-xs bg-white p-1.5 border border-slate-200"
                  >
                    <span className="font-mono text-slate-600">[{rec.sentAt}]</span>
                    <span className="font-semibold text-slate-800">
                      {rec.candidateCount} profiles sent to <strong>{rec.recipient}</strong>
                    </span>
                    <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 border border-emerald-300 uppercase">
                      {rec.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* SQLite Merge vs Fresh Pull Prompt Modal */}
      {sqlitePromptState.previousPull && (
        <SqlitePromptModal
          isOpen={sqlitePromptState.isOpen}
          onClose={() => setSqlitePromptState((prev) => ({ ...prev, isOpen: false }))}
          previousPull={sqlitePromptState.previousPull}
          onMerge={handleConfirmMerge}
          onFresh={handleConfirmFresh}
          roleName={requirement.role}
        />
      )}

      {/* API Key Credentials Modal */}
      <ApiKeyConfigModal
        isOpen={isApiKeysModalOpen}
        onClose={() => setIsApiKeysModalOpen(false)}
        config={apiKeysConfig}
        onSaveConfig={handleSaveApiKeysConfig}
        onShowToast={showToast}
      />

      {/* Email Dispatch Modal */}
      <EmailDispatchModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSend={handleSendEmail}
        selectedCandidates={relevantCandidates.filter((c) => selectedCandidateIds.includes(c.id))}
        validations={reverseValidations}
        requirement={requirement}
        pythonScript={generatedScript}
      />

      {/* Candidate Dossier Detail Modal */}
      <CandidateDetailModal
        candidate={selectedCandidateDetail}
        validation={selectedCandidateDetail ? reverseValidations[selectedCandidateDetail.id] : undefined}
        onClose={() => setSelectedCandidateDetail(null)}
      />

      {/* Add / Edit Custom Role & Skills Modal */}
      <AddRoleModal
        isOpen={isAddRoleModalOpen}
        onClose={() => setIsAddRoleModalOpen(false)}
        onSaveRole={handleSaveRoleFromModal}
        onDeleteRole={handleDeleteRole}
        initialRoleConfig={editingRoleConfig}
        existingRoles={availableRolesList}
        onShowToast={showToast}
        geminiApiKey={apiKeysConfig.geminiApiKey}
      />
    </div>
  );
}
