import React, { useState, useMemo } from 'react';
import {
  CandidateProfile,
  ReverseValidationResult,
  SourcingRequirement,
} from '../types';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Mail,
  ExternalLink,
  Building2,
  MapPin,
  Calendar,
  Sparkles,
  ChevronRight,
  UserCheck,
  Award,
  Filter,
  Search,
  Download,
  LayoutList,
  Table as TableIcon,
  Star,
  ArrowUpDown,
  FileText,
} from 'lucide-react';
import { ImportOutputModal } from './ImportOutputModal';

interface ReverseValidationPanelProps {
  candidates: CandidateProfile[];
  validations: Record<string, ReverseValidationResult>;
  selectedCandidateIds: string[];
  onToggleCandidate: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onOpenEmailModal: () => void;
  requirement: SourcingRequirement;
  onOpenCandidateDetail: (candidate: CandidateProfile) => void;
  onRunPythonPipeline?: () => void;
  onImportOutput?: (candidates: CandidateProfile[], validations: Record<string, ReverseValidationResult>) => void;
  isExecuting?: boolean;
}

export const ReverseValidationPanel: React.FC<ReverseValidationPanelProps> = ({
  candidates,
  validations,
  selectedCandidateIds,
  onToggleCandidate,
  onSelectAll,
  onDeselectAll,
  onOpenEmailModal,
  requirement,
  onOpenCandidateDetail,
  onRunPythonPipeline,
  onImportOutput,
  isExecuting = false,
}) => {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'QUALIFIED' | 'CITI' | 'HIGH' | 'MISMATCH'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [sortField, setSortField] = useState<'score' | 'yoe' | 'name' | 'citi'>('score');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Filter & Search Candidates
  const processedCandidates = useMemo(() => {
    return candidates
      .filter((c) => {
        const val = validations[c.id];
        const hasCiti = c.workedAtCiti || (c.summary && c.summary.toLowerCase().includes('citi')) || val?.auditNotes?.some(n => n.toLowerCase().includes('citi'));

        if (statusFilter === 'CITI') return hasCiti;
        if (statusFilter === 'HIGH') return val?.qualificationStatus === 'Highly Recommended' || (val?.overallJdFitScore && val.overallJdFitScore >= 85);
        if (statusFilter === 'QUALIFIED') {
          return (
            val?.qualificationStatus === 'Highly Recommended' ||
            val?.qualificationStatus === 'Qualified Match' ||
            val?.qualificationStatus === 'Potential Match' ||
            (val?.overallJdFitScore && val.overallJdFitScore >= 70)
          );
        }
        if (statusFilter === 'MISMATCH') return val?.qualificationStatus === 'Mismatch';
        return true;
      })
      .filter((c) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          c.currentCompany.toLowerCase().includes(q) ||
          c.currentRole.toLowerCase().includes(q) ||
          c.skills.some((s) => s.toLowerCase().includes(q)) ||
          c.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const scoreA = validations[a.id]?.overallJdFitScore || 0;
        const scoreB = validations[b.id]?.overallJdFitScore || 0;
        const citiA = a.workedAtCiti ? 1 : 0;
        const citiB = b.workedAtCiti ? 1 : 0;

        if (sortField === 'score') {
          return sortOrder === 'desc' ? scoreB - scoreA : scoreA - scoreB;
        }
        if (sortField === 'yoe') {
          return sortOrder === 'desc' ? b.experienceYears - a.experienceYears : a.experienceYears - b.experienceYears;
        }
        if (sortField === 'citi') {
          return sortOrder === 'desc' ? citiB - citiA : citiA - citiB;
        }
        if (sortField === 'name') {
          return sortOrder === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
        }
        return 0;
      });
  }, [candidates, validations, statusFilter, searchTerm, sortField, sortOrder]);

  const totalEvaluated = candidates.length;
  const recommendedCount = candidates.filter((c) => {
    const v = validations[c.id];
    return v && (v.qualificationStatus === 'Highly Recommended' || v.qualificationStatus === 'Qualified Match' || v.overallJdFitScore >= 75);
  }).length;
  const citiCount = candidates.filter((c) => c.workedAtCiti || (c.summary && c.summary.toLowerCase().includes('citi'))).length;

  const handleSortToggle = (field: 'score' | 'yoe' | 'name' | 'citi') => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleExportCsv = () => {
    const headers = [
      'Candidate Name',
      'Verdict',
      'Fit Score',
      'YoE',
      'Location',
      'Current Company',
      'Service Company',
      'Worked at Citi',
      'LinkedIn URL',
      'Matched Skills',
      'Missing Skills',
      'Recruiter Summary'
    ];

    const rows = processedCandidates.map((c) => {
      const v = validations[c.id];
      return [
        `"${c.name}"`,
        `"${v?.qualificationStatus || 'Evaluated'}"`,
        v?.overallJdFitScore || 0,
        c.experienceYears,
        `"${c.location}"`,
        `"${c.currentCompany}"`,
        c.isServiceCompany ? 'Yes' : 'No',
        c.workedAtCiti ? 'Yes' : 'No',
        `"${c.profileSourceUrl}"`,
        `"${(v?.matchedMustHave || c.skills).slice(0, 5).join(', ')}"`,
        `"${(v?.missingMustHave || []).join(', ')}"`,
        `"${(v?.recruiterAssessment || c.summary || '').replace(/"/g, '""')}"`
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `candidates_qualification_table_${requirement.role.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="border-2 border-slate-900 bg-white flex flex-col h-full shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
      {/* Header Bar */}
      <div className="border-b-2 border-slate-900 bg-slate-100 p-3.5 sm:p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-slate-900" />
            <h2 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900">
              Sourced & Evaluated Candidates Output
            </h2>
            <span className="text-[10px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 uppercase">
              Tabular Output
            </span>
          </div>
          <p className="text-xs text-slate-600 font-medium mt-0.5">
            Role: <strong>{requirement.role || 'Active Role'}</strong> • Location: <strong>{requirement.location}</strong> • Experience: <strong>{requirement.experienceRange || '5 to 10 years'}</strong>
          </p>
        </div>

        {/* Quick Stats & Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          <div className="flex items-center gap-1.5">
            <div className="bg-white border border-slate-900 px-2.5 py-1 text-xs font-bold text-slate-900 shadow-sm">
              <span className="text-emerald-700 font-black">{recommendedCount}</span> / {totalEvaluated} Shortlisted
            </div>
            {citiCount > 0 && (
              <div className="bg-blue-50 border border-blue-600 text-blue-900 px-2 py-1 text-xs font-black flex items-center gap-1">
                <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                {citiCount} Citi Exp
              </div>
            )}
            <div className="bg-slate-900 text-white px-2.5 py-1 text-xs font-bold font-mono">
              {selectedCandidateIds.length} Selected
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {onRunPythonPipeline && (
              <button
                type="button"
                onClick={onRunPythonPipeline}
                disabled={isExecuting}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase px-3 py-1.5 border border-slate-900 flex items-center gap-1.5 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                {isExecuting ? 'Running...' : 'Run Pipeline'}
              </button>
            )}
            {onImportOutput && (
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="bg-white hover:bg-slate-50 text-slate-900 text-xs font-bold uppercase px-2.5 py-1.5 border border-slate-900 flex items-center gap-1 cursor-pointer"
                title="Import local terminal execution output or CSV"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-600" />
                Import Output
              </button>
            )}
            <button
              type="button"
              onClick={handleExportCsv}
              className="bg-white hover:bg-slate-50 text-slate-900 text-xs font-bold uppercase px-2.5 py-1.5 border border-slate-900 flex items-center gap-1 cursor-pointer"
              title="Download CSV of evaluated candidates table"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar: Search, Filters & View Toggle */}
      <div className="border-b border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        {/* Search & Status Filters */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, company, skill..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-slate-900"
            />
          </div>

          <div className="flex items-center gap-1">
            {(['ALL', 'QUALIFIED', 'CITI', 'HIGH', 'MISMATCH'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStatusFilter(tab)}
                className={`px-2 py-1 text-[10px] font-bold uppercase transition-colors cursor-pointer ${
                  statusFilter === tab
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {tab === 'CITI' ? '★ Citi Exp' : tab === 'HIGH' ? 'Top Fit' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* View Toggle & Bulk Select */}
        <div className="flex items-center gap-3 text-xs">
          {/* View Mode Toggle */}
          <div className="flex items-center border border-slate-300 bg-white">
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`p-1 flex items-center gap-1 text-[11px] font-bold uppercase cursor-pointer ${
                viewMode === 'table' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Table View"
            >
              <TableIcon className="w-3.5 h-3.5" />
              Table
            </button>
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`p-1 flex items-center gap-1 text-[11px] font-bold uppercase cursor-pointer ${
                viewMode === 'cards' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
              title="Dossier Cards View"
            >
              <LayoutList className="w-3.5 h-3.5" />
              Cards
            </button>
          </div>

          <div className="flex items-center gap-1.5 font-bold">
            <button
              type="button"
              onClick={onSelectAll}
              className="text-[11px] text-slate-800 hover:underline uppercase cursor-pointer"
            >
              Select All
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={onDeselectAll}
              className="text-[11px] text-slate-800 hover:underline uppercase cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-slate-50/50">
        {candidates.length === 0 ? (
          <div className="text-center py-16 bg-white border-2 border-dashed border-slate-300 m-4 p-8 flex flex-col items-center justify-center">
            <div className="w-12 h-12 bg-slate-100 border border-slate-900 flex items-center justify-center mb-3">
              <UserCheck className="w-6 h-6 text-slate-900" />
            </div>
            <p className="text-sm font-black uppercase tracking-wider text-slate-900">Live Sourcing Ready</p>
            <p className="text-xs text-slate-600 mt-1.5 max-w-md">
              All dummy candidate records have been cleared. Click <strong>"Run Pipeline"</strong> in the requirement panel or header to trigger live talent extraction and Gemini Reverse JD evaluation.
            </p>
            {onRunPythonPipeline && (
              <button
                type="button"
                onClick={onRunPythonPipeline}
                disabled={isExecuting}
                className="mt-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase px-4 py-2 border border-slate-900 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-400" />
                {isExecuting ? 'Running Live Pipeline...' : 'Run Live Pipeline Now'}
              </button>
            )}
          </div>
        ) : processedCandidates.length === 0 ? (
          <div className="text-center py-16 bg-white border border-dashed border-slate-300 m-4 p-8">
            <p className="text-sm font-bold text-slate-800">No candidates found matching your filter / search.</p>
            <p className="text-xs text-slate-500 mt-1">Try resetting filters or searching for different criteria.</p>
          </div>
        ) : viewMode === 'table' ? (
          /* TABULAR FORMAT OUTPUT */
          <div className="overflow-x-auto min-w-full">
            <table className="w-full border-collapse text-left text-xs bg-white">
              <thead>
                <tr className="bg-slate-900 text-white font-mono uppercase text-[10px] tracking-wider border-b border-slate-900">
                  <th className="py-2.5 px-3 w-10 text-center">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="py-2.5 px-2 w-10 text-center">#</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-slate-800"
                    onClick={() => handleSortToggle('name')}
                  >
                    <div className="flex items-center gap-1">
                      Candidate Name & Current Role
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-slate-800 text-center"
                    onClick={() => handleSortToggle('score')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Verdict & Score
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th
                    className="py-2.5 px-2 cursor-pointer hover:bg-slate-800 text-center"
                    onClick={() => handleSortToggle('yoe')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      YoE
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Current Employer</th>
                  <th
                    className="py-2.5 px-3 cursor-pointer hover:bg-slate-800 text-center"
                    onClick={() => handleSortToggle('citi')}
                  >
                    <div className="flex items-center justify-center gap-1">
                      Citi Exp?
                      <ArrowUpDown className="w-3 h-3 opacity-60" />
                    </div>
                  </th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Key Stack & Skills</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {processedCandidates.map((candidate, idx) => {
                  const val = validations[candidate.id];
                  const isSelected = selectedCandidateIds.includes(candidate.id);
                  const isMismatch = val?.qualificationStatus === 'Mismatch';
                  const score = val?.overallJdFitScore ?? 80;
                  const hasCiti = candidate.workedAtCiti || (candidate.summary && candidate.summary.toLowerCase().includes('citi'));

                  let verdictBadge = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                  let verdictText = val?.qualificationStatus || (score >= 80 ? 'STRONG MATCH' : 'POTENTIAL MATCH');

                  if (verdictText.includes('Highly') || verdictText.includes('STRONG')) {
                    verdictBadge = 'bg-emerald-100 text-emerald-900 border-emerald-400 font-black';
                  } else if (verdictText.includes('Qualified') || verdictText.includes('POTENTIAL')) {
                    verdictBadge = 'bg-blue-100 text-blue-900 border-blue-400 font-bold';
                  } else if (isMismatch || verdictText.includes('REJECT') || verdictText.includes('Mismatch')) {
                    verdictBadge = 'bg-red-100 text-red-900 border-red-300 font-bold';
                  }

                  return (
                    <tr
                      key={candidate.id}
                      className={`hover:bg-slate-50 transition-colors ${
                        isSelected ? 'bg-amber-50/70 font-medium' : idx % 2 === 1 ? 'bg-slate-50/30' : 'bg-white'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onToggleCandidate(candidate.id)}
                          className="w-4 h-4 accent-slate-900 rounded-none cursor-pointer"
                        />
                      </td>

                      {/* Index */}
                      <td className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-500 font-bold">
                        {idx + 1}
                      </td>

                      {/* Candidate Name & Title */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col">
                          <span
                            onClick={() => onOpenCandidateDetail(candidate)}
                            className="font-bold text-slate-900 hover:text-blue-700 hover:underline cursor-pointer flex items-center gap-1.5"
                          >
                            {candidate.name}
                          </span>
                          <span className="text-[11px] text-slate-500 truncate max-w-[220px]">
                            {candidate.currentRole}
                          </span>
                        </div>
                      </td>

                      {/* Verdict & Score */}
                      <td className="py-2.5 px-3 text-center">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className={`text-[9px] uppercase px-2 py-0.5 border ${verdictBadge}`}>
                            {verdictText}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-700">
                            {score}% Fit
                          </span>
                        </div>
                      </td>

                      {/* YoE */}
                      <td className="py-2.5 px-2 text-center font-mono font-bold text-slate-800">
                        {candidate.experienceYears}y
                      </td>

                      {/* Current Company */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-800">{candidate.currentCompany}</span>
                            {candidate.isServiceCompany && (
                              <span className="text-[8px] font-bold bg-purple-100 text-purple-800 border border-purple-200 px-1 py-0.2">
                                +15
                              </span>
                            )}
                          </div>
                          {candidate.googleVerification && (
                            <span
                              className={`inline-flex items-center gap-1 text-[9px] font-mono px-1 py-0.2 border w-fit ${
                                candidate.googleVerification.status === 'VERIFIED_MATCH'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 font-bold'
                                  : candidate.googleVerification.status === 'FLAGGED_DISCREPANCY'
                                  ? 'bg-red-50 text-red-800 border-red-300 font-bold'
                                  : 'bg-blue-50 text-blue-800 border-blue-200'
                              }`}
                              title={candidate.googleVerification.guardrailVerdict}
                            >
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                              {candidate.googleVerification.status === 'VERIFIED_MATCH' ? 'Google Verified' : 'Google Checked'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Citi Exp */}
                      <td className="py-2.5 px-3 text-center">
                        {hasCiti ? (
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-900 border border-blue-300 px-1.5 py-0.5 text-[10px] font-black">
                            <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                            Yes
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono text-[11px]">No</span>
                        )}
                      </td>

                      {/* Location */}
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {candidate.location}
                      </td>

                      {/* Key Stack & Skills */}
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {(val?.matchedMustHave && val.matchedMustHave.length > 0 ? val.matchedMustHave : candidate.skills)
                            .slice(0, 4)
                            .map((sk) => (
                              <span
                                key={sk}
                                className="bg-slate-100 text-slate-800 text-[9px] font-mono px-1.5 py-0.5 border border-slate-200"
                              >
                                {sk}
                              </span>
                            ))}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenCandidateDetail(candidate)}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-900 text-[10px] font-bold uppercase px-2 py-1 border border-slate-300 cursor-pointer"
                          >
                            Details
                          </button>
                          <a
                            href={candidate.profileSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 p-1"
                            title="Open Profile URL"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* CARD DOSSIER VIEW */
          <div className="p-4 space-y-3">
            {processedCandidates.map((candidate) => {
              const validation = validations[candidate.id];
              const isSelected = selectedCandidateIds.includes(candidate.id);
              const isMismatch = validation?.qualificationStatus === 'Mismatch';

              let badgeClass = 'bg-emerald-100 text-emerald-800 border-emerald-300';
              if (validation?.qualificationStatus === 'Qualified Match') {
                badgeClass = 'bg-blue-100 text-blue-800 border-blue-300';
              } else if (validation?.qualificationStatus === 'Potential Match') {
                badgeClass = 'bg-amber-100 text-amber-800 border-amber-300';
              } else if (isMismatch) {
                badgeClass = 'bg-red-100 text-red-800 border-red-300';
              }

              return (
                <div
                  key={candidate.id}
                  className={`border-2 transition-all ${
                    isSelected ? 'border-slate-900 bg-white shadow-[3px_3px_0px_0px_rgba(15,23,42,1)]' : 'border-slate-300 bg-white hover:border-slate-500'
                  } ${isMismatch ? 'opacity-75 hover:opacity-100' : ''} p-3.5`}
                >
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleCandidate(candidate.id)}
                        className="mt-1 w-4 h-4 accent-slate-900 rounded-none cursor-pointer shrink-0"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            onClick={() => onOpenCandidateDetail(candidate)}
                            className="text-sm font-black text-slate-900 uppercase hover:underline cursor-pointer tracking-tight"
                          >
                            {candidate.name}
                          </h3>

                          {validation && (
                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 border ${badgeClass}`}>
                              {validation.overallJdFitScore}% Fit • {validation.qualificationStatus}
                            </span>
                          )}

                          {candidate.isServiceCompany && (
                            <span className="text-[9px] font-bold bg-purple-100 text-purple-800 border border-purple-300 px-1.5 py-0.5">
                              Service Co (+15)
                            </span>
                          )}

                          {(candidate.workedAtCiti || (validation?.auditNotes?.some(n => n.includes('Citi')))) && (
                            <span className="text-[9px] font-black bg-blue-100 text-blue-900 border border-blue-400 px-1.5 py-0.5 flex items-center gap-1">
                              <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
                              Past Citi Experience
                            </span>
                          )}

                          {candidate.googleVerification && (
                            <span
                              className={`text-[9px] font-mono px-1.5 py-0.5 border flex items-center gap-1 ${
                                candidate.googleVerification.status === 'VERIFIED_MATCH'
                                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold'
                                  : candidate.googleVerification.status === 'FLAGGED_DISCREPANCY'
                                  ? 'bg-red-100 text-red-900 border-red-400 font-bold'
                                  : 'bg-blue-100 text-blue-900 border-blue-300'
                              }`}
                            >
                              <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                              {candidate.googleVerification.status === 'VERIFIED_MATCH' ? 'Google Grounding Verified' : 'Google Verified'}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="font-semibold text-slate-800 flex items-center gap-1">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                            {candidate.currentRole} at <strong>{candidate.currentCompany}</strong>
                          </span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <Calendar className="w-3.5 h-3.5 text-slate-500" />
                            {candidate.experienceYears} Years Exp
                          </span>
                          <span className="flex items-center gap-1 text-slate-600">
                            <MapPin className="w-3.5 h-3.5 text-slate-500" />
                            {candidate.location} ({candidate.country})
                          </span>
                        </div>

                        {validation?.recruiterAssessment && (
                          <p className="text-xs text-slate-700 mt-2 bg-slate-50 p-2 border-l-2 border-slate-900">
                            <strong>Recruiter Audit:</strong> {validation.recruiterAssessment}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <button
                        type="button"
                        onClick={() => onOpenCandidateDetail(candidate)}
                        className="text-xs font-bold text-slate-900 hover:bg-slate-100 border border-slate-300 px-2.5 py-1.5 flex items-center gap-1 uppercase"
                      >
                        Dossier <ChevronRight className="w-3 h-3" />
                      </button>
                      <a
                        href={candidate.profileSourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-blue-600 hover:underline flex items-center gap-1 font-mono"
                      >
                        LinkedIn <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer / Send Via Email Action Bar */}
      <div className="p-3.5 sm:p-4 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0 border-t-2 border-slate-900">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-200">
            Dispatch Sourced & Validated Pipeline
          </p>
          <p className="text-[11px] text-slate-400">
            {selectedCandidateIds.length} candidate profile{selectedCandidateIds.length !== 1 ? 's' : ''} selected with reverse JD qualification metrics
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenEmailModal}
          disabled={selectedCandidateIds.length === 0}
          className={`w-full sm:w-auto px-6 py-2.5 sm:py-3 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 border-2 transition-all ${
            selectedCandidateIds.length === 0
              ? 'bg-slate-700 text-slate-400 border-slate-600 cursor-not-allowed'
              : 'bg-white text-slate-900 hover:bg-slate-100 border-white shadow-[2px_2px_0px_0px_rgba(255,255,255,1)] active:translate-x-0.5 active:translate-y-0.5 cursor-pointer'
          }`}
        >
          <Mail className="w-4 h-4 text-slate-900" />
          Send via Email ({selectedCandidateIds.length})
        </button>
      </div>

      {/* Import Output Modal */}
      {onImportOutput && (
        <ImportOutputModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onImport={(cands, valids) => {
            onImportOutput(cands, valids);
            setIsImportModalOpen(false);
          }}
        />
      )}
    </div>
  );
};
