import React, { useState } from 'react';
import {
  CandidateProfile,
  ReverseValidationResult,
  SourcingRequirement,
  EmailDispatchPayload,
} from '../types';
import { Mail, X, Check, Paperclip, Send, ShieldCheck, Sparkles } from 'lucide-react';

interface EmailDispatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (payload: EmailDispatchPayload) => void;
  selectedCandidates: CandidateProfile[];
  validations: Record<string, ReverseValidationResult>;
  requirement: SourcingRequirement;
  pythonScript: string;
  defaultEmail?: string;
}

export const EmailDispatchModal: React.FC<EmailDispatchModalProps> = ({
  isOpen,
  onClose,
  onSend,
  selectedCandidates,
  validations,
  requirement,
  pythonScript,
  defaultEmail = 'snarghya@gmail.com',
}) => {
  const [recipientEmail, setRecipientEmail] = useState(defaultEmail);
  const [ccEmail, setCcEmail] = useState('');
  const [subject, setSubject] = useState(
    `[RCA Sourcing Report] Verified ${requirement.role || 'Candidate'} Profiles & Reverse JD Validation Audit`
  );
  const [includePythonScript, setIncludePythonScript] = useState(true);
  const [includeValidationTelemetry, setIncludeValidationTelemetry] = useState(true);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !recipientEmail.includes('@')) {
      alert('Please enter a valid recipient email address.');
      return;
    }

    setIsSending(true);
    setTimeout(() => {
      onSend({
        recipientEmail,
        ccEmail,
        subject,
        includePythonScript,
        includeValidationTelemetry,
        selectedCandidateIds: selectedCandidates.map((c) => c.id),
        additionalNotes,
      });
      setIsSending(false);
      setSendSuccess(true);
      setTimeout(() => {
        setSendSuccess(false);
        onClose();
      }, 1500);
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white border-2 border-slate-900 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-[8px_8px_0px_0px_rgba(15,23,42,1)] overflow-hidden">
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-black uppercase tracking-wider">
              Send Candidate Pipeline Via Email
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content / Form */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-4">
          {sendSuccess ? (
            <div className="py-12 text-center space-y-3">
              <div className="w-12 h-12 bg-emerald-100 text-emerald-700 border-2 border-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h4 className="text-xl font-black uppercase tracking-tight text-slate-900">
                Email Successfully Dispatched!
              </h4>
              <p className="text-xs text-slate-600">
                The candidate evaluation package, reverse validation audit matrix, and python script were delivered to <strong className="text-slate-900">{recipientEmail}</strong>.
              </p>
            </div>
          ) : (
            <>
              {/* Recipient Email */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-900 block mb-1">
                  Recipient Email ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={recipientEmail}
                  onChange={(e) => setRecipientEmail(e.target.value)}
                  placeholder="e.g. hiring.manager@enterprise.com"
                  className="w-full border-2 border-slate-900 px-3 py-2 text-sm font-sans text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* CC Email */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  CC Email (Optional)
                </label>
                <input
                  type="text"
                  value={ccEmail}
                  onChange={(e) => setCcEmail(e.target.value)}
                  placeholder="recruiter@enterprise.com, sourcer@enterprise.com"
                  className="w-full border border-slate-400 px-3 py-2 text-sm font-sans text-slate-900 bg-white focus:outline-none focus:border-slate-900"
                />
              </div>

              {/* Subject Line */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-900 block mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full border-2 border-slate-900 px-3 py-2 text-sm font-sans text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Attached Payload Options */}
              <div className="bg-slate-50 border border-slate-300 p-3.5 space-y-2">
                <span className="text-[11px] font-black uppercase tracking-widest text-slate-700 block mb-1.5 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-900" /> Included Package Attachments & Data:
                </span>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeValidationTelemetry}
                    onChange={(e) => setIncludeValidationTelemetry(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 rounded-none cursor-pointer"
                  />
                  <span>
                    Include Reverse Validation Audit & Fit Matrix ({selectedCandidates.length} candidate dossiers)
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePythonScript}
                    onChange={(e) => setIncludePythonScript(e.target.checked)}
                    className="w-4 h-4 accent-slate-900 rounded-none cursor-pointer"
                  />
                  <span>Attach Generated Python Automation Script (.py)</span>
                </label>
              </div>

              {/* Notes / Comments */}
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-slate-700 block mb-1">
                  Recruiter Notes / Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  placeholder="e.g. Shortlisted based on 100% must-have match and immediate availability..."
                  className="w-full border border-slate-300 p-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-slate-900 resize-none"
                />
              </div>

              {/* Selected Candidates Summary Mini-Table */}
              <div className="border border-slate-200 p-2.5 max-h-32 overflow-y-auto">
                <span className="text-[10px] font-mono uppercase text-slate-500 font-bold block mb-1">
                  Candidates to be attached ({selectedCandidates.length}):
                </span>
                <ul className="text-xs space-y-1 text-slate-700">
                  {selectedCandidates.map((c) => {
                    const v = validations[c.id];
                    return (
                      <li key={c.id} className="flex justify-between items-center bg-slate-50 p-1 border border-slate-200">
                        <span className="font-semibold text-slate-900">{c.name} ({c.currentCompany})</span>
                        <span className="text-[10px] font-bold font-mono text-emerald-800">
                          {v?.overallJdFitScore}% Match • {v?.qualificationStatus}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {/* Modal Footer Buttons */}
          {!sendSuccess && (
            <div className="pt-3 border-t-2 border-slate-900 flex justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-bold uppercase text-slate-700 hover:bg-slate-100 border border-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-6 py-2.5 text-xs font-black uppercase tracking-wider bg-slate-900 text-white hover:bg-slate-800 border-2 border-slate-900 flex items-center gap-2 shadow-[2px_2px_0px_0px_rgba(15,23,42,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                <Send className="w-3.5 h-3.5" />
                {isSending ? 'Transmitting Email...' : 'Send Mail Now'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
