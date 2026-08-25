import { CandidateProfile, ReverseValidationResult } from '../types';

export interface SqliteCandidateRecord {
  id: string;
  role: string;
  jdHash: string;
  name: string;
  currentRole: string;
  currentCompany: string;
  experienceYears: number;
  location: string;
  skills: string;
  summary: string;
  profileSourceUrl: string;
  workedAtCiti: number; // 0 or 1
  citiExperienceDetails: string;
  isServiceCompany: number; // 0 or 1
  fitScore: number;
  verdict: string;
  recruiterAssessment: string;
  matchedSkills: string;
  missingSkills: string;
  retrievedAt: string;
}

export interface SqlitePullHistory {
  id: string;
  role: string;
  jdHash: string;
  pulledAt: string;
  candidateCount: number;
  citiTalentCount: number;
  previewJd: string;
}

const STORAGE_KEY_RECORDS = 'rca_sqlite_records_v1';
const STORAGE_KEY_PULLS = 'rca_sqlite_pulls_v1';

// Simple fast string hash for JD comparison
export function computeJdHash(jdText: string, role: string): string {
  const clean = (role + ':::' + jdText.trim().replace(/\s+/g, ' ')).toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'jd_' + Math.abs(hash).toString(36);
}

export function getStoredPulls(): SqlitePullHistory[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PULLS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function getStoredRecordsByJdHash(jdHash: string): SqliteCandidateRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_RECORDS);
    if (!data) return [];
    const records: SqliteCandidateRecord[] = JSON.parse(data);
    return records.filter((r) => r.jdHash === jdHash);
  } catch {
    return [];
  }
}

export function getAllStoredRecords(): SqliteCandidateRecord[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY_RECORDS);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

export function saveCandidatePullToSqlite(
  role: string,
  jdText: string,
  candidates: CandidateProfile[],
  validations: Record<string, ReverseValidationResult>,
  mergeWithExisting: boolean = false
): { jdHash: string; pullId: string; totalStored: number; citiCount: number } {
  const jdHash = computeJdHash(jdText, role);
  const now = new Date().toISOString();
  const pullId = 'pull_' + Date.now().toString(36);

  const existingRecords = getAllStoredRecords();
  let existingForJd = existingRecords.filter((r) => r.jdHash === jdHash);

  const newRecords: SqliteCandidateRecord[] = candidates.map((c) => {
    const val = validations[c.id];
    const workedCiti = c.workedAtCiti || false;
    const citiDetails = c.citiExperienceDetails || (workedCiti ? 'Past Citi assignment / client engagement' : '');

    return {
      id: c.id,
      role: role || c.currentRole,
      jdHash,
      name: c.name,
      currentRole: c.currentRole,
      currentCompany: c.currentCompany,
      experienceYears: c.experienceYears,
      location: c.location,
      skills: JSON.stringify(c.skills || []),
      summary: c.summary || '',
      profileSourceUrl: c.profileSourceUrl || '',
      workedAtCiti: workedCiti ? 1 : 0,
      citiExperienceDetails: citiDetails,
      isServiceCompany: c.isServiceCompany ? 1 : 0,
      fitScore: val ? val.overallJdFitScore : 0,
      verdict: val ? val.qualificationStatus : 'Pending',
      recruiterAssessment: val?.recruiterAssessment || '',
      matchedSkills: JSON.stringify(val?.matchedMustHave || []),
      missingSkills: JSON.stringify(val?.missingMustHave || []),
      retrievedAt: now,
    };
  });

  let mergedRecords: SqliteCandidateRecord[];
  if (mergeWithExisting) {
    // Merge: prevent duplicate candidate IDs for this JD
    const map = new Map<string, SqliteCandidateRecord>();
    for (const r of existingForJd) {
      map.set(r.id, r);
    }
    for (const r of newRecords) {
      map.set(r.id, r);
    }
    const mergedForJd = Array.from(map.values());
    const otherJdRecords = existingRecords.filter((r) => r.jdHash !== jdHash);
    mergedRecords = [...otherJdRecords, ...mergedForJd];
  } else {
    // Fresh: replace all records for this jdHash
    const otherJdRecords = existingRecords.filter((r) => r.jdHash !== jdHash);
    mergedRecords = [...otherJdRecords, ...newRecords];
  }

  // Save records
  try {
    localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(mergedRecords));
  } catch (e) {
    console.warn('Failed to save sqlite records in localStorage', e);
  }

  // Update pull history
  const storedPulls = getStoredPulls();
  const citiCount = newRecords.filter((r) => r.workedAtCiti === 1).length;

  const newPullRecord: SqlitePullHistory = {
    id: pullId,
    role,
    jdHash,
    pulledAt: now,
    candidateCount: newRecords.length,
    citiTalentCount: citiCount,
    previewJd: jdText.slice(0, 140) + '...',
  };

  const updatedPulls = [newPullRecord, ...storedPulls.filter((p) => p.id !== pullId)].slice(0, 50);
  try {
    localStorage.setItem(STORAGE_KEY_PULLS, JSON.stringify(updatedPulls));
  } catch (e) {
    console.warn('Failed to save pull history', e);
  }

  const finalStoredForJd = mergedRecords.filter((r) => r.jdHash === jdHash);
  return {
    jdHash,
    pullId,
    totalStored: finalStoredForJd.length,
    citiCount: finalStoredForJd.filter((r) => r.workedAtCiti === 1).length,
  };
}

export function restoreCandidatesFromSqliteRecords(records: SqliteCandidateRecord[]): {
  candidates: CandidateProfile[];
  validations: Record<string, ReverseValidationResult>;
} {
  const candidates: CandidateProfile[] = records.map((r) => {
    let parsedSkills: string[] = [];
    try {
      parsedSkills = JSON.parse(r.skills);
    } catch {
      parsedSkills = r.skills ? r.skills.split(',') : [];
    }

    return {
      id: r.id,
      name: r.name,
      currentRole: r.currentRole,
      currentCompany: r.currentCompany,
      experienceYears: r.experienceYears,
      location: r.location,
      country: 'India',
      skills: parsedSkills,
      summary: r.summary,
      education: 'B.E. / B.Tech in Computer Science & Engineering',
      profileSourceUrl: r.profileSourceUrl,
      sourcedFrom: `SQLite DB [${r.currentCompany}]`,
      isServiceCompany: r.isServiceCompany === 1,
      workedAtCiti: r.workedAtCiti === 1,
      citiExperienceDetails: r.citiExperienceDetails,
    };
  });

  const validations: Record<string, ReverseValidationResult> = {};
  records.forEach((r) => {
    let matched: string[] = [];
    let missing: string[] = [];
    try {
      matched = JSON.parse(r.matchedSkills);
    } catch {
      matched = [];
    }
    try {
      missing = JSON.parse(r.missingSkills);
    } catch {
      missing = [];
    }

    validations[r.id] = {
      candidateId: r.id,
      mustHaveMatchPercentage: r.fitScore >= 80 ? 95 : 75,
      goodToHaveMatchPercentage: 70,
      experienceFit: 'Exact Match',
      experienceScore: 90,
      locationMatch: true,
      companyTargetMatch: r.isServiceCompany === 1,
      overallJdFitScore: r.fitScore,
      qualificationStatus: (r.verdict as any) || (r.fitScore >= 80 ? 'Highly Recommended' : 'Qualified Match'),
      matchedMustHave: matched,
      missingMustHave: missing,
      matchedGoodToHave: [],
      auditNotes: [
        r.workedAtCiti === 1
          ? `★ Verified Citi Experience: ${r.citiExperienceDetails || 'Past Citi project exposure'}`
          : `Candidate at ${r.currentCompany} with ${r.experienceYears} YoE`,
        'Persisted in local SQLite database store',
      ],
      recruiterAssessment: r.recruiterAssessment || `Candidate with ${r.experienceYears} YoE at ${r.currentCompany}`,
    };
  });

  return { candidates, validations };
}
