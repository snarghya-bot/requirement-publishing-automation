import React, { useState, useEffect } from 'react';
import {
  AVAILABLE_LOCATIONS,
  POPULAR_COMPANIES,
} from '../data/roleDefaults';
import { RoleType, ExperienceRange, LocationType, SourcingRequirement } from '../types';
import {
  Code2,
  Plus,
  X,
  Building2,
  MapPin,
  Briefcase,
  Layers,
  Sparkles,
  FileText,
  Key,
  ShieldAlert,
  Save,
  Settings2,
  RotateCcw,
  Check,
  Play,
  CheckCircle2,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import {
  CompanyItem,
  getInitialCompanies,
  saveCompanyToDb,
  deleteCompanyFromDb,
  resetCompaniesToDefault,
  syncCompaniesWithServer,
  isCompanyForbidden,
} from '../utils/companyStorage';

interface RequirementFormProps {
  requirement: SourcingRequirement;
  availableRolesList: {
    role: string;
    isCustom: boolean;
    isModified: boolean;
    title: string;
  }[];
  onUpdateRequirement: (req: Partial<SourcingRequirement>) => void;
  onRoleSelect: (role: RoleType) => void;
  onOpenAddRoleModal: () => void;
  onOpenEditRoleModal: () => void;
  onSaveCurrentRoleSkillsToDb: () => void;
  onResetCurrentRoleToDefault: () => void;
  isSavingSkills?: boolean;
  hasSavedSkillsRecently?: boolean;
  onGenerateScript: () => void;
  isGenerating: boolean;
  onOpenApiKeysModal: () => void;
  isLiveMode?: boolean;
  hasCrustKey?: boolean;
  onRunPython?: () => void;
  isExecuting?: boolean;
}

export const RequirementForm: React.FC<RequirementFormProps> = ({
  requirement,
  availableRolesList,
  onUpdateRequirement,
  onRoleSelect,
  onOpenAddRoleModal,
  onOpenEditRoleModal,
  onSaveCurrentRoleSkillsToDb,
  onResetCurrentRoleToDefault,
  isSavingSkills = false,
  hasSavedSkillsRecently = false,
  onGenerateScript,
  isGenerating,
  onOpenApiKeysModal,
  isLiveMode = true,
  hasCrustKey = false,
  onRunPython,
  isExecuting = false,
}) => {
  const [newMustHave, setNewMustHave] = useState('');
  const [newGoodToHave, setNewGoodToHave] = useState('');
  const [customCompany, setCustomCompany] = useState('');
  const [companyFeedback, setCompanyFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [companiesList, setCompaniesList] = useState<CompanyItem[]>(() => getInitialCompanies());
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [showJdDetails, setShowJdDetails] = useState(false);

  useEffect(() => {
    syncCompaniesWithServer().then((list) => {
      if (list && list.length > 0) {
        setCompaniesList(list);
      }
    });
  }, []);

  const currentRoleInfo = availableRolesList.find((r) => r.role === requirement.role);
  const isCustomRole = currentRoleInfo?.isCustom ?? false;
  const isModified = currentRoleInfo?.isModified ?? false;

  const handleAddMustHave = () => {
    const raw = newMustHave.trim();
    if (!raw) return;

    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !requirement.mustHaveSkills.includes(s));

    if (parts.length > 0) {
      onUpdateRequirement({
        mustHaveSkills: [...requirement.mustHaveSkills, ...parts],
      });
      setNewMustHave('');
    }
  };

  const handleRemoveMustHave = (skill: string) => {
    onUpdateRequirement({
      mustHaveSkills: requirement.mustHaveSkills.filter((s) => s !== skill),
    });
  };

  const handleAddGoodToHave = () => {
    const raw = newGoodToHave.trim();
    if (!raw) return;

    const parts = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !requirement.goodToHaveSkills.includes(s));

    if (parts.length > 0) {
      onUpdateRequirement({
        goodToHaveSkills: [...requirement.goodToHaveSkills, ...parts],
      });
      setNewGoodToHave('');
    }
  };

  const handleRemoveGoodToHave = (skill: string) => {
    onUpdateRequirement({
      goodToHaveSkills: requirement.goodToHaveSkills.filter((s) => s !== skill),
    });
  };

  const handleToggleCompany = (company: string) => {
    const exists = requirement.targetCompanies.includes(company);
    if (exists) {
      onUpdateRequirement({
        targetCompanies: requirement.targetCompanies.filter((c) => c !== company),
      });
    } else {
      onUpdateRequirement({
        targetCompanies: [...requirement.targetCompanies, company],
      });
    }
  };

  const handleSelectAllCompanies = () => {
    const allNames = companiesList.map((c) => c.name);
    onUpdateRequirement({ targetCompanies: allNames });
  };

  const handleClearCompanies = () => {
    onUpdateRequirement({ targetCompanies: [] });
  };

  const handleAddCustomCompany = async () => {
    const trimmed = customCompany.trim();
    if (!trimmed) return;

    setCompanyFeedback(null);

    // 1. Strict TCS Non-Negotiable Exclusion Check
    if (isCompanyForbidden(trimmed)) {
      setCompanyFeedback({
        type: 'error',
        text: `'${trimmed}' is strictly on the non-negotiable disqualification list (TCS) and cannot be added.`,
      });
      return;
    }

    setIsSavingCompany(true);
    try {
      const result = await saveCompanyToDb(trimmed);
      setCompaniesList(result.companies);

      // Auto-check and add to targetCompanies
      if (!requirement.targetCompanies.includes(trimmed)) {
        onUpdateRequirement({
          targetCompanies: [...requirement.targetCompanies, trimmed],
        });
      }

      setCustomCompany('');
      setCompanyFeedback({
        type: 'success',
        text: `✓ Added & saved '${trimmed}' to database!`,
      });

      setTimeout(() => {
        setCompanyFeedback(null);
      }, 4000);
    } catch (err: any) {
      setCompanyFeedback({
        type: 'error',
        text: err.message || 'Failed to save company to database.',
      });
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleDeleteCustomCompany = async (companyName: string) => {
    try {
      const res = await deleteCompanyFromDb(companyName);
      setCompaniesList(res.companies);
      onUpdateRequirement({
        targetCompanies: requirement.targetCompanies.filter((c) => c !== companyName),
      });
      setCompanyFeedback({
        type: 'success',
        text: `Removed '${companyName}' from database.`,
      });
      setTimeout(() => setCompanyFeedback(null), 3000);
    } catch (err: any) {
      setCompanyFeedback({
        type: 'error',
        text: err.message || 'Failed to delete company.',
      });
    }
  };

  const standardRoles = availableRolesList.filter((r) => !r.isCustom);
  const customRoles = availableRolesList.filter((r) => r.isCustom);

  return (
    <aside className="w-full lg:w-96 border-r-2 border-slate-900 p-5 bg-slate-50 flex flex-col gap-5 shrink-0 overflow-y-auto max-h-full">
      {/* 1. ROLE SELECTION DROPDOWN & ADD ROLE BUTTON */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-1.5">
            <Briefcase className="w-3.5 h-3.5 text-slate-900" />
            Profile / Role Selection
          </label>

          <button
            id="add-custom-role-btn"
            type="button"
            onClick={onOpenAddRoleModal}
            className="bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-[10px] font-black uppercase px-2 py-0.5 border border-slate-900 flex items-center gap-1 shadow-sm cursor-pointer transition-transform active:scale-95"
            title="Create and save a new custom role (e.g. Unisys Mainframe) to database"
          >
            <Plus className="w-3 h-3" />
            <span>Add Role</span>
          </button>
        </div>

        <div className="flex gap-1.5">
          <select
            value={requirement.role}
            onChange={(e) => onRoleSelect(e.target.value as RoleType)}
            className="flex-1 border-2 border-slate-900 px-3 py-2 text-sm font-bold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]"
          >
            <option value="" disabled>-- Select Candidate Profile --</option>
            
            {customRoles.length > 0 && (
              <optgroup label="★ Custom Roles (Saved in DB)">
                {customRoles.map((r) => (
                  <option key={r.role} value={r.role}>
                    ★ {r.role} {r.isModified ? '(Saved DB)' : ''}
                  </option>
                ))}
              </optgroup>
            )}

            <optgroup label="Standard Roles">
              {standardRoles.map((r) => (
                <option key={r.role} value={r.role}>
                  {r.role} {r.isModified ? '• (Customized)' : ''}
                </option>
              ))}
            </optgroup>
          </select>

          {requirement.role && (
            <button
              type="button"
              onClick={onOpenEditRoleModal}
              className="border-2 border-slate-900 bg-white hover:bg-slate-100 p-2 text-slate-800 cursor-pointer shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] shrink-0"
              title="Edit role title, JD template, and default skills"
            >
              <Settings2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Active Role Meta Indicator */}
        {requirement.role && (
          <div className="flex items-center justify-between text-[10px] font-mono px-1">
            <span className="text-slate-600">
              {isCustomRole ? '★ Custom Role in Database' : 'Standard Preset'}
            </span>
            {isModified && (
              <span className="text-emerald-700 font-bold bg-emerald-50 px-1 border border-emerald-300">
                DB Configured
              </span>
            )}
          </div>
        )}
      </div>

      {/* API CREDENTIALS QUICK ACCESS BANNER */}
      <div className="border-2 border-slate-900 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-900 flex items-center gap-1">
            <Key className="w-3 h-3 text-slate-700" />
            API Keys & Execution
          </span>
          <span
            className={`text-[9px] font-mono font-bold px-1.5 py-0.5 border ${
              hasCrustKey
                ? 'bg-emerald-100 text-emerald-800 border-emerald-400'
                : 'bg-amber-100 text-amber-800 border-amber-400'
            }`}
          >
            {hasCrustKey ? 'LIVE READY' : 'KEYS SETUP'}
          </span>
        </div>
        <p className="text-[11px] text-slate-600 mb-2 leading-tight">
          Configure Crustdata & Gemini API keys to pull live talent profiles, detect past Citi experience, and store in SQLite.
        </p>
        <button
          type="button"
          onClick={onOpenApiKeysModal}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white py-1.5 px-3 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Key className="w-3 h-3 text-amber-400" />
          {hasCrustKey ? 'Manage API Keys' : 'Enter API Keys'}
        </button>
      </div>

      {/* STRICT EXCLUSIONS & CITI DETECTION BANNER */}
      <div className="border-2 border-red-900 bg-red-50 p-2.5">
        <div className="flex items-center gap-1.5 text-red-900 font-black text-[11px] uppercase tracking-wider mb-1">
          <ShieldAlert className="w-3.5 h-3.5 text-red-700" />
          Strict Exclusions Enforced
        </div>
        <ul className="text-[10px] text-red-800 space-y-0.5 list-disc list-inside font-medium">
          <li><strong>TCS:</strong> Current or past employment strictly rejected.</li>
          <li><strong>Citi:</strong> Current employees strictly rejected (past Citi allowed & tracked).</li>
        </ul>
      </div>

      {/* JD PREVIEW & EDIT TOGGLE */}
      {requirement.role && (
        <div className="border border-slate-300 bg-white p-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowJdDetails(!showJdDetails)}
              className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5 hover:text-slate-600"
            >
              <FileText className="w-3.5 h-3.5" />
              {showJdDetails ? 'Hide Job Description' : 'View / Edit Job Description (JD)'}
            </button>
            <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 text-slate-600 uppercase">
              {requirement.role}
            </span>
          </div>

          {showJdDetails && (
            <div className="mt-2.5 pt-2 border-t border-slate-200">
              <textarea
                value={requirement.customJd}
                onChange={(e) => onUpdateRequirement({ customJd: e.target.value })}
                rows={4}
                placeholder="Enter or customize the job description text..."
                className="w-full border border-slate-900 p-2 text-xs font-sans text-slate-800 bg-slate-50 focus:bg-white focus:outline-none resize-y"
              />
              <p className="text-[10px] text-slate-500 mt-1 italic">
                * Reverse validation compares sourced profiles against this exact JD and checks SQLite database history.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 2. DYNAMIC MUST-HAVE & GOOD-TO-HAVE SKILLS WINDOWS */}
      {requirement.role && (
        <div className="space-y-4">
          {/* Top Bar for Skills: Save to DB & Reset Actions */}
          <div className="flex items-center justify-between gap-2 bg-slate-200/80 p-2 border border-slate-300">
            <div className="text-[10px] font-mono text-slate-700 font-bold uppercase">
              Skills Configuration
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSaveCurrentRoleSkillsToDb}
                disabled={isSavingSkills}
                className={`text-[10px] font-black uppercase px-2 py-1 flex items-center gap-1 border transition-all cursor-pointer ${
                  hasSavedSkillsRecently
                    ? 'bg-emerald-500 text-white border-emerald-600'
                    : 'bg-emerald-400 hover:bg-emerald-300 text-slate-950 border-slate-900 shadow-sm'
                }`}
                title="Persist current must-have and good-to-have skills for this role in database"
              >
                {hasSavedSkillsRecently ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Saved to DB!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3 h-3" />
                    <span>{isSavingSkills ? 'Saving...' : 'Save to DB for this Role'}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={onResetCurrentRoleToDefault}
                className="text-[10px] font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-300 px-1.5 py-1 uppercase hover:bg-slate-100 cursor-pointer"
                title="Reset this role to factory defaults"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* MUST-HAVE SKILLS WINDOW */}
          <div className="border-2 border-slate-900 bg-white p-3.5 relative shadow-[2px_2px_0px_0px_rgba(15,23,42,1)]">
            <span className="absolute -top-3 left-3 bg-slate-900 text-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
              Must-Have Skills ({requirement.mustHaveSkills.length})
            </span>

            <div className="mt-2 flex flex-wrap gap-1.5 min-h-[48px] max-h-36 overflow-y-auto p-1 bg-slate-50 border border-slate-200">
              {requirement.mustHaveSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 bg-slate-900 text-white text-[11px] font-bold px-2 py-1"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveMustHave(skill)}
                    className="hover:text-red-300 ml-0.5 cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {requirement.mustHaveSkills.length === 0 && (
                <span className="text-xs text-slate-400 italic p-1">No must-have skills specified (Blank)</span>
              )}
            </div>

            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={newMustHave}
                onChange={(e) => setNewMustHave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMustHave())}
                placeholder="Add must-have skill (or comma-separated)..."
                className="flex-1 border border-slate-900 px-2 py-1 text-xs bg-white text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddMustHave}
                className="bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 text-xs font-bold flex items-center gap-1 uppercase cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {/* GOOD-TO-HAVE SKILLS WINDOW */}
          <div className="border-2 border-slate-400 bg-white p-3.5 relative">
            <span className="absolute -top-3 left-3 bg-slate-200 text-slate-800 border border-slate-400 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest">
              Good-to-Have Skills ({requirement.goodToHaveSkills.length})
            </span>

            <div className="mt-2 flex flex-wrap gap-1.5 min-h-[48px] max-h-36 overflow-y-auto p-1 bg-slate-50 border border-slate-200">
              {requirement.goodToHaveSkills.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 bg-slate-200 text-slate-800 text-[11px] font-bold px-2 py-1 border border-slate-300"
                >
                  {skill}
                  <button
                    type="button"
                    onClick={() => handleRemoveGoodToHave(skill)}
                    className="hover:text-red-600 ml-0.5 cursor-pointer"
                    title="Remove skill"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {requirement.goodToHaveSkills.length === 0 && (
                <span className="text-xs text-slate-400 italic p-1">No bonus skills specified (Blank)</span>
              )}
            </div>

            <div className="mt-2 flex gap-1.5">
              <input
                type="text"
                value={newGoodToHave}
                onChange={(e) => setNewGoodToHave(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddGoodToHave())}
                placeholder="Add good-to-have skill (or comma-separated)..."
                className="flex-1 border border-slate-400 px-2 py-1 text-xs bg-white text-slate-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddGoodToHave}
                className="bg-slate-300 hover:bg-slate-400 text-slate-900 px-2.5 py-1 text-xs font-bold flex items-center gap-1 uppercase cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. RELEVANT YEARS OF EXPERIENCE DROPDOWN */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-900" />
            Relevant Years of Experience
          </label>
          <span className="text-[10px] font-mono text-slate-400 uppercase">Optional</span>
        </div>
        <select
          value={requirement.experienceRange}
          onChange={(e) => onUpdateRequirement({ experienceRange: e.target.value as ExperienceRange })}
          className="w-full border-2 border-slate-900 px-3 py-2 text-sm font-bold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
        >
          <option value="">Leave Blank (Any Experience)</option>
          <option value="Below 5 years">Below 5 years (Junior - Mid)</option>
          <option value="5 to 10 years">5 to 10 years (Senior)</option>
          <option value="5 to 15 years">5 to 15 years (Senior - Lead / Principal)</option>
          <option value="15+ years">15+ years (Staff / Architect)</option>
        </select>
      </div>

      {/* 4. LOCATION DROPDOWN */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-slate-900" />
            Geographic Scope / Location
          </label>
          <span className="text-[10px] font-mono text-slate-400 uppercase">Filter</span>
        </div>
        <select
          value={requirement.location}
          onChange={(e) => onUpdateRequirement({ location: e.target.value as LocationType })}
          className="w-full border-2 border-slate-900 px-3 py-2 text-sm font-bold bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
        >
          {AVAILABLE_LOCATIONS.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.label}
            </option>
          ))}
        </select>
      </div>

      {/* 5. PROFILE SOURCED FROM COMPANY (ALL TICKED BY DEFAULT + DB PERSISTENCE) */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-800 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-900" />
            Profile Sourced From Company
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllCompanies}
              className="text-[10px] text-slate-900 font-bold uppercase hover:underline cursor-pointer"
            >
              All ({companiesList.length})
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={handleClearCompanies}
              className="text-[10px] text-red-600 hover:underline font-bold uppercase cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="text-[10px] text-slate-700 mb-2 p-1.5 bg-blue-50 border border-blue-200 flex items-start gap-1">
          <CheckCircle2 className="w-3 h-3 text-blue-700 shrink-0 mt-0.5" />
          <span>
            <strong>Default:</strong> All {companiesList.length} companies selected. <strong>TCS & Current Citi</strong> are strictly excluded.
          </span>
        </div>

        {/* Company Feedback Banner (Success / Error) */}
        {companyFeedback && (
          <div
            className={`mb-2 p-2 text-[11px] border flex items-start gap-1.5 animate-in fade-in ${
              companyFeedback.type === 'error'
                ? 'bg-rose-50 border-rose-400 text-rose-950 font-bold'
                : 'bg-emerald-50 border-emerald-400 text-emerald-950 font-bold'
            }`}
          >
            {companyFeedback.type === 'error' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
            )}
            <span className="leading-tight">{companyFeedback.text}</span>
          </div>
        )}

        {/* Company Checkboxes List */}
        <div className="border-2 border-slate-900 bg-white p-2.5 h-44 overflow-y-auto space-y-1.5">
          {companiesList.map((companyItem) => {
            const isChecked = requirement.targetCompanies.includes(companyItem.name);
            return (
              <div
                key={companyItem.name}
                className={`flex items-center justify-between text-xs p-1 transition-colors ${
                  isChecked ? 'bg-slate-100 font-bold text-slate-900' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => handleToggleCompany(companyItem.name)}
                    className="w-3.5 h-3.5 accent-slate-900 rounded-none cursor-pointer shrink-0"
                  />
                  <span className="truncate">{companyItem.name}</span>
                </label>

                {companyItem.isCustom && (
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <span className="text-[9px] font-mono bg-emerald-100 text-emerald-900 border border-emerald-300 px-1 py-0.2 uppercase font-bold">
                      ★ DB
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteCustomCompany(companyItem.name)}
                      className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                      title={`Remove '${companyItem.name}' from saved database`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Custom Company Adder & Save to DB */}
        <div className="mt-2 flex gap-1.5">
          <input
            type="text"
            value={customCompany}
            onChange={(e) => setCustomCompany(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddCustomCompany())}
            placeholder="Add & save company to DB..."
            disabled={isSavingCompany}
            className="flex-1 border border-slate-900 px-2 py-1 text-xs bg-white text-slate-900 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleAddCustomCompany}
            disabled={isSavingCompany || !customCompany.trim()}
            className="bg-slate-900 hover:bg-slate-800 text-white px-2.5 py-1 text-xs font-bold uppercase cursor-pointer disabled:opacity-50 flex items-center gap-1 shadow-sm shrink-0"
            title="Save custom company to database"
          >
            <Plus className="w-3 h-3" />
            <span>Add & Save</span>
          </button>
        </div>
      </div>

      {/* PRIMARY ACTION: RUN PYTHON PIPELINE & SHOW TABLE */}
      <div className="pt-2 mt-auto flex flex-col gap-2">
        <button
          type="button"
          onClick={onRunPython || onGenerateScript}
          disabled={!requirement.role || isExecuting || isGenerating}
          className={`w-full font-black uppercase py-3.5 px-4 tracking-wider flex items-center justify-center gap-2 border-2 border-slate-900 transition-all ${
            !requirement.role
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed border-slate-400'
              : 'bg-slate-900 text-white hover:bg-slate-800 shadow-[3px_3px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none cursor-pointer'
          }`}
        >
          {isExecuting ? (
            <>
              <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
              <span>Running Pipeline...</span>
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-emerald-400 text-emerald-400" />
              <span>Run Pipeline & Show Table</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onGenerateScript}
          disabled={!requirement.role || isGenerating}
          className="w-full text-[11px] font-bold text-slate-700 hover:text-slate-900 hover:bg-slate-200 py-1.5 px-2 border border-slate-300 flex items-center justify-center gap-1.5 uppercase transition-colors cursor-pointer"
        >
          <Code2 className="w-3.5 h-3.5" />
          {isGenerating ? 'Updating script...' : 'Inspect Python Code (Optional)'}
        </button>
      </div>
    </aside>
  );
};
