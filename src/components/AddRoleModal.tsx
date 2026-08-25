import React, { useState, useEffect } from 'react';
import {
  Plus,
  X,
  Briefcase,
  Sparkles,
  Save,
  Trash2,
  RotateCcw,
  FileText,
  CheckCircle2,
  Layers,
  HelpCircle,
} from 'lucide-react';
import { RoleConfig } from '../types';
import { AVAILABLE_ROLES } from '../data/roleDefaults';

interface AddRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveRole: (config: RoleConfig) => Promise<void>;
  onDeleteRole?: (roleName: string) => Promise<void>;
  initialRoleConfig?: RoleConfig | null;
  existingRoles: { role: string; isCustom: boolean }[];
  onShowToast: (msg: string) => void;
  /** Gemini key used to auto-generate must-have / good-to-have skill keywords for
   * whatever role name + JD text is currently in the form. Optional -- if empty, the
   * "Generate with Gemini" button still shows but the backend returns an honest
   * "no key configured" result instead of fabricating skills. */
  geminiApiKey?: string;
}

const TEMPLATE_PRESETS: {
  name: string;
  title: string;
  mustHave: string[];
  goodToHave: string[];
  jd: string;
}[] = [
  {
    name: 'Unisys Mainframe',
    title: 'Unisys Mainframe (ClearPath / OS 2200 / MCP) Engineer',
    mustHave: [
      'Unisys Mainframe OS 2200 / MCP',
      'COBOL / ECL (Executive Control Language)',
      'DMS 2200 / RDMS Database',
      'TIP / HVTIP Transaction Processing',
      'Batch Job Scheduling & ECL Scripts',
      'Abend Troubleshooting & Core Dump Analysis',
    ],
    goodToHave: [
      'Unisys BIS (Business Information Server)',
      'ClearPath Forward Enterprise Servers',
      'Data Communication (DPS / CPComm)',
      'Banking / Financial Settlement Systems',
      'Mainframe Integration & REST APIs',
    ],
    jd: 'Seeking an experienced Unisys Mainframe Engineer to maintain, debug, and support mission-critical banking batch and transaction processing workloads running on Unisys ClearPath (OS 2200 / MCP). Experience with ECL, COBOL, DMS 2200, and TIP is required.',
  },
  {
    name: 'Golang Backend Engineer',
    title: 'Senior Go (Golang) Microservices Engineer',
    mustHave: [
      'Golang (Go 1.21+)',
      'Goroutines & Channels Concurrency',
      'gRPC & Protocol Buffers',
      'REST API Design (Gin / Echo / Chi)',
      'PostgreSQL / CockroachDB',
      'Unit & Benchmark Testing in Go',
    ],
    goodToHave: [
      'Kafka / RabbitMQ',
      'Docker & Kubernetes',
      'Redis Distributed Caching',
      'Distributed Tracing (OpenTelemetry)',
      'CI/CD Pipelines',
    ],
    jd: 'Looking for a skilled Golang Backend Engineer to design high-throughput, low-latency microservices using Go, gRPC, and distributed databases.',
  },
  {
    name: 'Salesforce Developer',
    title: 'Salesforce Core / Apex / LWC Developer',
    mustHave: [
      'Apex Programming',
      'Lightning Web Components (LWC)',
      'SOQL & SOSL Queries',
      'Salesforce Flow & Automation',
      'REST & SOAP Integrations',
      'Triggers & Bulkification Best Practices',
    ],
    goodToHave: [
      'Sales Cloud & Service Cloud',
      'Financial Services Cloud (FSC)',
      'Salesforce DX & Git CI/CD',
      'Platform Developer II Certified',
      'MuleSoft Integration Basics',
    ],
    jd: 'Responsible for designing and implementing custom business logic, Lightning Web Components, and secure API integrations on the Salesforce platform.',
  },
  {
    name: 'Cybersecurity / SOC Analyst',
    title: 'L2/L3 SOC & Security Operations Analyst',
    mustHave: [
      'SIEM Tools (Splunk / Microsoft Sentinel / QRadar)',
      'Security Incident Triage & Investigation',
      'Network Protocols & Packet Analysis (Wireshark)',
      'EDR / XDR (CrowdStrike / Defender for Endpoint)',
      'Threat Hunting & MITRE ATT&CK Framework',
    ],
    goodToHave: [
      'SOAR Playbooks & Python Scripting',
      'Vulnerability Scanning (Qualys / Tenable)',
      'Cloud Security (AWS GuardDuty / Azure Sentinel)',
      'Incident Response SLA Management',
    ],
    jd: 'Responsible for real-time cyber threat detection, incident response, vulnerability management, and security telemetry analysis across enterprise environments.',
  },
];

export const AddRoleModal: React.FC<AddRoleModalProps> = ({
  isOpen,
  onClose,
  onSaveRole,
  onDeleteRole,
  initialRoleConfig,
  existingRoles,
  onShowToast,
  geminiApiKey,
}) => {
  const [roleName, setRoleName] = useState('');
  const [roleTitle, setRoleTitle] = useState('');
  const [jdText, setJdText] = useState('');
  const [mustHaveSkills, setMustHaveSkills] = useState<string[]>([]);
  const [goodToHaveSkills, setGoodToHaveSkills] = useState<string[]>([]);
  const [newMustHave, setNewMustHave] = useState('');
  const [newGoodToHave, setNewGoodToHave] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingSkills, setIsGeneratingSkills] = useState(false);

  const isEditing = Boolean(initialRoleConfig);
  const isCustomRole = initialRoleConfig
    ? !AVAILABLE_ROLES.includes(initialRoleConfig.role as any)
    : true;

  // Initialize modal state on open or config change
  useEffect(() => {
    if (isOpen) {
      if (initialRoleConfig) {
        setRoleName(initialRoleConfig.role);
        setRoleTitle(initialRoleConfig.title || `${initialRoleConfig.role} Specialist`);
        setJdText(initialRoleConfig.defaultJd || '');
        setMustHaveSkills([...initialRoleConfig.defaultMustHaveSkills]);
        setGoodToHaveSkills([...initialRoleConfig.defaultGoodToHaveSkills]);
      } else {
        // Default blank role state
        setRoleName('');
        setRoleTitle('');
        setJdText('');
        setMustHaveSkills([]);
        setGoodToHaveSkills([]);
      }
      setNewMustHave('');
      setNewGoodToHave('');
    }
  }, [isOpen, initialRoleConfig]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: (typeof TEMPLATE_PRESETS)[0]) => {
    setRoleName(preset.name);
    setRoleTitle(preset.title);
    setJdText(preset.jd);
    setMustHaveSkills([...preset.mustHave]);
    setGoodToHaveSkills([...preset.goodToHave]);
    onShowToast(`Applied '${preset.name}' template!`);
  };

  const handleStartBlank = () => {
    setRoleName('');
    setRoleTitle('');
    setJdText('');
    setMustHaveSkills([]);
    setGoodToHaveSkills([]);
    onShowToast('Started with clean, blank template.');
  };

  const handleAddMustHaveSkill = () => {
    const raw = newMustHave.trim();
    if (!raw) return;

    // Support comma-separated batch adding
    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !mustHaveSkills.includes(s));

    if (parts.length > 0) {
      setMustHaveSkills([...mustHaveSkills, ...parts]);
      setNewMustHave('');
    }
  };

  const handleRemoveMustHaveSkill = (skill: string) => {
    setMustHaveSkills(mustHaveSkills.filter((s) => s !== skill));
  };

  const handleAddGoodToHaveSkill = () => {
    const raw = newGoodToHave.trim();
    if (!raw) return;

    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !goodToHaveSkills.includes(s));

    if (parts.length > 0) {
      setGoodToHaveSkills([...goodToHaveSkills, ...parts]);
      setNewGoodToHave('');
    }
  };

  const handleRemoveGoodToHaveSkill = (skill: string) => {
    setGoodToHaveSkills(goodToHaveSkills.filter((s) => s !== skill));
  };

  // Calls Gemini (server-side) to generate must-have / good-to-have skill keywords
  // from the role name + JD text currently in the form, and merges them into the
  // existing tag lists (deduped, additive -- never overwrites what's already there).
  const handleGenerateWithGemini = async () => {
    const cleanRoleName = roleName.trim();
    if (!cleanRoleName) {
      onShowToast('Enter a Role Name first so Gemini knows what to generate skills for.');
      return;
    }

    setIsGeneratingSkills(true);
    try {
      const res = await fetch('/api/generate-search-context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: cleanRoleName,
          customJd: jdText.trim() || undefined,
          geminiApiKey,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        onShowToast(`Gemini skill generation failed: ${data.error || 'Unknown error'}`);
        return;
      }

      if (data.usedFallback) {
        onShowToast(data.note || 'Gemini could not generate skills -- add a Gemini API key first, or enter skills manually.');
        return;
      }

      const newMust = (data.mustHaveSkills || []).filter((s: string) => !mustHaveSkills.includes(s));
      const newGood = (data.goodToHaveSkills || []).filter((s: string) => !goodToHaveSkills.includes(s));

      if (newMust.length > 0) setMustHaveSkills((prev) => [...prev, ...newMust]);
      if (newGood.length > 0) setGoodToHaveSkills((prev) => [...prev, ...newGood]);

      if (newMust.length === 0 && newGood.length === 0) {
        onShowToast(`Gemini (${data.generatedBy}) had nothing new to add -- these skills are already listed.`);
      } else {
        onShowToast(
          `✓ Gemini (${data.generatedBy}) added ${newMust.length} must-have + ${newGood.length} good-to-have skill${newMust.length + newGood.length === 1 ? '' : 's'}. Review and edit below before saving.`
        );
      }
    } catch (err: any) {
      onShowToast(`Gemini skill generation error: ${err.message || 'Network error'}`);
    } finally {
      setIsGeneratingSkills(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanRoleName = roleName.trim();
    if (!cleanRoleName) {
      onShowToast('Please enter a Role Name.');
      return;
    }

    setIsSaving(true);
    try {
      const configToSave: RoleConfig = {
        role: cleanRoleName,
        title: roleTitle.trim() || `${cleanRoleName} Specialist`,
        defaultJd:
          jdText.trim() ||
          `Job description for ${cleanRoleName}. Responsible for designing, implementing, and supporting ${cleanRoleName} systems.`,
        defaultMustHaveSkills: mustHaveSkills,
        defaultGoodToHaveSkills: goodToHaveSkills,
        isCustom: !AVAILABLE_ROLES.includes(cleanRoleName as any),
        isModified: true,
      };

      await onSaveRole(configToSave);
      onShowToast(`✓ Role '${cleanRoleName}' and skill configuration saved to database!`);
      onClose();
    } catch (err: any) {
      onShowToast('Failed to save role: ' + (err.message || 'Unknown error'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initialRoleConfig || !onDeleteRole) return;
    if (!window.confirm(`Are you sure you want to delete custom role '${initialRoleConfig.role}'?`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await onDeleteRole(initialRoleConfig.role);
      onShowToast(`✓ Role '${initialRoleConfig.role}' deleted.`);
      onClose();
    } catch (err: any) {
      onShowToast('Failed to delete role: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border-2 border-slate-900 w-full max-w-3xl shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-400 text-slate-950 font-black">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-black uppercase tracking-wider">
                {isEditing ? `Edit / Configure Role: ${initialRoleConfig?.role}` : 'Add New Role & Skill Set'}
              </h2>
              <p className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">
                Persistent Database Storage • Automatic Sourcing & Reverse Validation Sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-5 text-slate-900 flex-1">
          {/* Quick Preset Templates or Blank Option */}
          {!isEditing && (
            <div className="bg-slate-100 border border-slate-300 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  Quick Presets & Blank Starter
                </span>
                <button
                  type="button"
                  onClick={handleStartBlank}
                  className="text-[10px] font-bold text-slate-700 bg-white border border-slate-300 px-2 py-0.5 uppercase hover:bg-slate-200 cursor-pointer"
                >
                  Start Completely Blank
                </button>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {TEMPLATE_PRESETS.map((t) => (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => handleApplyPreset(t)}
                    className="text-xs font-bold bg-white hover:bg-emerald-50 border border-slate-300 hover:border-emerald-500 px-2.5 py-1 text-slate-800 flex items-center gap-1 shadow-sm cursor-pointer transition-all"
                  >
                    <span>+ {t.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 1. ROLE NAME & TITLE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center justify-between">
                <span>Role Name / Identifier *</span>
                <span className="text-[10px] font-mono text-slate-500 font-normal">e.g. Unisys Mainframe</span>
              </label>
              <input
                type="text"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                disabled={isEditing && !isCustomRole}
                placeholder="e.g. Unisys Mainframe"
                className="w-full border-2 border-slate-900 px-3 py-2 text-xs font-bold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 disabled:bg-slate-100"
                required
              />
              {isEditing && !isCustomRole && (
                <p className="text-[10px] text-slate-500 font-mono italic">
                  Standard preset identifier is locked; you can customize all skills and JD below.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center justify-between">
                <span>Display Title</span>
                <span className="text-[10px] font-mono text-slate-500 font-normal">Senior / Lead Title</span>
              </label>
              <input
                type="text"
                value={roleTitle}
                onChange={(e) => setRoleTitle(e.target.value)}
                placeholder="e.g. Lead Unisys ClearPath / ECL Mainframe Engineer"
                className="w-full border-2 border-slate-900 px-3 py-2 text-xs font-sans bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* 2. JOB DESCRIPTION (JD) TEMPLATE */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-700" />
                Default Job Description (JD)
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                Used for Reverse Semantic Validation & Sourcing
              </span>
            </div>
            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value)}
              rows={3}
              placeholder="Enter comprehensive job description requirements..."
              className="w-full border-2 border-slate-900 p-2.5 text-xs font-sans text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>

          {/* Gemini-driven skill generation -- reads Role Name + JD above, calls
              /api/generate-search-context, and adds returned skills to the tag lists
              below. Purely additive and always editable. */}
          <div className="border border-dashed border-emerald-400 bg-emerald-50/60 p-3 flex items-center justify-between gap-3">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-950">
                <strong>Generate skills with Gemini:</strong> uses the Role Name and JD above to suggest
                must-have / good-to-have skill keywords. Suggestions are added to the lists below for you
                to review, edit, or remove -- nothing is added silently.
              </p>
            </div>
            <button
              type="button"
              onClick={handleGenerateWithGemini}
              disabled={isGeneratingSkills}
              className="shrink-0 border-2 border-emerald-600 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 px-3 py-2 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isGeneratingSkills ? 'Generating...' : 'Generate with Gemini'}</span>
            </button>
          </div>

          {/* 3. MUST-HAVE SKILLS BUILDER */}
          <div className="border-2 border-slate-900 bg-slate-50 p-4 space-y-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Must-Have Skills ({mustHaveSkills.length})
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                Strict mandatory skills required for qualification
              </span>
            </div>

            {/* Current Must-Have Tags */}
            <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white border border-slate-300">
              {mustHaveSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 bg-slate-900 text-white text-[11px] font-bold px-2 py-1"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveMustHaveSkill(skill)}
                    className="hover:text-red-300 ml-0.5 cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {mustHaveSkills.length === 0 && (
                <span className="text-xs text-slate-400 italic p-1">
                  No must-have skills specified (Blank). Add skills below.
                </span>
              )}
            </div>

            {/* Input field for adding must-have skill */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newMustHave}
                onChange={(e) => setNewMustHave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMustHaveSkill())}
                placeholder="Type skill name (or comma-separated e.g. COBOL, ECL, DMS 2200)..."
                className="flex-1 border-2 border-slate-900 px-3 py-1.5 text-xs font-mono bg-white text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddMustHaveSkill}
                className="bg-slate-900 hover:bg-slate-800 text-white px-3.5 py-1.5 text-xs font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* 4. GOOD-TO-HAVE SKILLS BUILDER */}
          <div className="border-2 border-slate-300 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Good-to-Have / Bonus Skills ({goodToHaveSkills.length})
              </label>
              <span className="text-[10px] font-mono text-slate-500">
                Bonus skills providing extra scoring weight
              </span>
            </div>

            {/* Current Good-To-Have Tags */}
            <div className="flex flex-wrap gap-1.5 min-h-[44px] max-h-36 overflow-y-auto p-2 bg-white border border-slate-300">
              {goodToHaveSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 text-[11px] font-bold px-2 py-1 border border-slate-300"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveGoodToHaveSkill(skill)}
                    className="hover:text-red-600 ml-0.5 cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {goodToHaveSkills.length === 0 && (
                <span className="text-xs text-slate-400 italic p-1">
                  No good-to-have skills specified (Blank). Add skills below.
                </span>
              )}
            </div>

            {/* Input field for adding good-to-have skill */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newGoodToHave}
                onChange={(e) => setNewGoodToHave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGoodToHaveSkill())}
                placeholder="Type bonus skill name (or comma-separated)..."
                className="flex-1 border border-slate-400 px-3 py-1.5 text-xs font-mono bg-white text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoodToHaveSkill}
                className="bg-slate-300 hover:bg-slate-400 text-slate-900 px-3.5 py-1.5 text-xs font-bold uppercase flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
          </div>

          {/* Database Persistence Note */}
          <div className="bg-emerald-50 border border-emerald-300 p-3 text-[11px] text-emerald-950 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <p>
              <strong>Automatic Database Sync:</strong> When you save this role, it is stored in the database. Next time you open the app or select this role, all must-have skills, good-to-have skills, and JD will be loaded automatically.
            </p>
          </div>

          {/* Actions Bar */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200">
            <div>
              {isEditing && isCustomRole && onDeleteRole && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="border border-red-300 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-2 text-xs font-bold uppercase flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeleting ? 'Deleting...' : 'Delete Custom Role'}</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 px-4 py-2 text-xs font-bold uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="border-2 border-slate-900 bg-emerald-400 hover:bg-emerald-300 text-slate-950 px-5 py-2 text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving to Database...' : 'Save Role & Skills to DB'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
