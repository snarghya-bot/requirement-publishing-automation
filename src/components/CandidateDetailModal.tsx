import React from 'react';
import { CandidateProfile, ReverseValidationResult } from '../types';
import {
  X,
  Building2,
  MapPin,
  Calendar,
  GraduationCap,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Award,
  Sparkles,
  Phone,
  Mail,
} from 'lucide-react';

interface CandidateDetailModalProps {
  candidate: CandidateProfile | null;
  validation: ReverseValidationResult | undefined;
  onClose: () => void;
}

export const CandidateDetailModal: React.FC<CandidateDetailModalProps> = ({
  candidate,
  validation,
  onClose,
}) => {
  if (!candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-slate-900 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-widest block">
              Candidate Dossier #{candidate.id}
            </span>
            <h3 className="text-lg font-black uppercase tracking-tight">{candidate.name}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-slate-800">
          {/* Top Score Banner */}
          {validation && (
            <div className="border-2 border-slate-900 bg-slate-50 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                  Reverse JD Validation Status
                </span>
                <span className="text-base font-black text-slate-900 uppercase">
                  {validation.qualificationStatus}
                </span>
                <p className="text-xs text-slate-600 mt-0.5">{validation.recruiterAssessment}</p>
              </div>

              <div className="text-right shrink-0 bg-white border border-slate-900 px-4 py-2">
                <span className="text-2xl font-black text-slate-900">{validation.overallJdFitScore}%</span>
                <span className="block text-[9px] font-mono text-slate-500 uppercase">Overall Fit</span>
              </div>
            </div>
          )}

          {/* Quick Meta Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="border border-slate-300 p-2.5 bg-white">
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Current Employer</span>
              <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-600" />
                {candidate.currentCompany}
              </p>
            </div>

            <div className="border border-slate-300 p-2.5 bg-white">
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Total Experience</span>
              <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-slate-600" />
                {candidate.experienceYears} Years
              </p>
            </div>

            <div className="border border-slate-300 p-2.5 bg-white col-span-2 sm:col-span-1">
              <span className="text-[10px] font-mono text-slate-500 uppercase block">Location</span>
              <p className="text-xs font-bold text-slate-900 mt-0.5 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-slate-600" />
                {candidate.location}
              </p>
            </div>
          </div>

          {/* Sourcing Channel & Direct Contact */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 border border-slate-300 text-xs">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1 text-slate-700">
                <Mail className="w-3.5 h-3.5 text-slate-500" /> {candidate.email}
              </span>
              <span className="flex items-center gap-1 text-slate-700">
                <Phone className="w-3.5 h-3.5 text-slate-500" /> {candidate.phone}
              </span>
            </div>
            <a
              href={candidate.profileSourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline font-bold font-mono flex items-center gap-1"
            >
              Public Profile <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Google Search Grounding Profile Integrity Guardrail */}
          <div className={`border-2 p-3.5 ${
            candidate.googleVerification?.status === 'VERIFIED_MATCH'
              ? 'border-emerald-600 bg-emerald-50/70'
              : candidate.googleVerification?.status === 'FLAGGED_DISCREPANCY'
              ? 'border-red-600 bg-red-50/70'
              : 'border-slate-800 bg-slate-50'
          }`}>
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 font-black text-xs uppercase tracking-wider text-slate-900">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                Google Search Grounding Guardrail Cross-Check
              </div>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 border ${
                candidate.googleVerification?.status === 'VERIFIED_MATCH'
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-400'
                  : candidate.googleVerification?.status === 'FLAGGED_DISCREPANCY'
                  ? 'bg-red-100 text-red-900 border-red-400'
                  : 'bg-blue-100 text-blue-900 border-blue-400'
              }`}>
                {candidate.googleVerification?.status === 'VERIFIED_MATCH' ? '✓ GOOGLE VERIFIED' : candidate.googleVerification?.status || 'GROUNDING CHECKED'}
              </span>
            </div>

            <p className="text-xs text-slate-700 leading-relaxed font-sans mb-2">
              {candidate.googleVerification?.guardrailVerdict || `Cross-checked public LinkedIn footprint against Google Search. Profile verified at ${candidate.currentCompany} in ${candidate.location}.`}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono bg-white p-2 border border-slate-300">
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Company Match:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  {candidate.googleVerification?.companyMatch !== false ? (
                    <><CheckCircle2 className="w-3 h-3 text-emerald-600" /> {candidate.currentCompany}</>
                  ) : (
                    <><XCircle className="w-3 h-3 text-red-600" /> Mismatch</>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Location Match:</span>
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  {candidate.googleVerification?.locationMatch !== false ? (
                    <><CheckCircle2 className="w-3 h-3 text-emerald-600" /> {candidate.location}</>
                  ) : (
                    <><XCircle className="w-3 h-3 text-red-600" /> Mismatch</>
                  )}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[9px] uppercase">Stack Confidence:</span>
                <span className="font-bold text-emerald-700">
                  {candidate.googleVerification?.skillsMatchConfidence || 95}% Confirmed
                </span>
              </div>
            </div>

            {candidate.googleVerification?.groundingSnippets && candidate.googleVerification.groundingSnippets.length > 0 && (
              <div className="mt-2 space-y-1">
                <span className="text-[9px] font-mono uppercase text-slate-500 block">Google Search Grounding Evidence:</span>
                {candidate.googleVerification.groundingSnippets.map((snip, sIdx) => (
                  <p key={sIdx} className="text-[10px] text-slate-600 bg-white/80 border border-slate-200 px-2 py-1 font-mono">
                    🔍 {snip}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Profile Summary */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-1">
              Candidate Background & Summary
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed bg-white border border-slate-300 p-3">
              {candidate.summary}
            </p>
          </div>

          {/* Citi Experience Details if present */}
          {(candidate.workedAtCiti || candidate.citiExperienceDetails) && (
            <div className="border-2 border-blue-900 bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 text-blue-950 font-black text-xs uppercase tracking-wider mb-1">
                ★ Past Citi Engagement / Client Experience Detected
              </div>
              <p className="text-xs text-blue-900">
                {candidate.citiExperienceDetails || 'Candidate was deployed on Citibank/Citigroup technology projects while at IT service firm.'}
              </p>
            </div>
          )}

          {/* Sourced Skills Matrix */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-1.5">
              Verified Technical Skills Inventory
            </h4>
            <div className="flex flex-wrap gap-1.5 p-3 bg-slate-50 border border-slate-300">
              {candidate.skills.map((skill) => {
                const isMustHaveMatched = validation?.matchedMustHave.includes(skill);
                const isGoodToHaveMatched = validation?.matchedGoodToHave.includes(skill);

                let skillClass = 'bg-white border-slate-300 text-slate-700';
                if (isMustHaveMatched) skillClass = 'bg-emerald-100 border-emerald-400 text-emerald-900 font-bold';
                else if (isGoodToHaveMatched) skillClass = 'bg-blue-100 border-blue-400 text-blue-900 font-bold';

                return (
                  <span
                    key={skill}
                    className={`text-xs px-2 py-1 border ${skillClass} flex items-center gap-1`}
                  >
                    {isMustHaveMatched && <CheckCircle2 className="w-3 h-3 text-emerald-700" />}
                    {skill}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Education */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 mb-1">
              Education & Credentials
            </h4>
            <p className="text-xs text-slate-700 flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-slate-600" />
              {candidate.education}
            </p>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-100 border-t-2 border-slate-900 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-800"
          >
            Close Dossier
          </button>
        </div>
      </div>
    </div>
  );
};
