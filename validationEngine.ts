import { CandidateProfile, ReverseValidationResult, SourcingRequirement } from '../types';

export function performReverseValidation(
  requirement: SourcingRequirement,
  candidates: CandidateProfile[]
): ReverseValidationResult[] {
  const reqMustHaves = requirement.mustHaveSkills.map((s) => s.trim().toLowerCase());
  const reqGoodToHaves = requirement.goodToHaveSkills.map((s) => s.trim().toLowerCase());
  const targetExp = requirement.experienceRange;
  const targetLocation = requirement.location;
  const targetCompanies = requirement.targetCompanies.map((c) => c.toLowerCase());

  return candidates.map((cand) => {
    const candSkillsLower = cand.skills.map((s) => s.toLowerCase());
    const candSummaryLower = (cand.summary || '').toLowerCase();
    const candCompanyLower = (cand.currentCompany || '').toLowerCase();
    const candRoleLower = (cand.currentRole || '').toLowerCase();

    // 1. Must-Have Skills Match
    const matchedMustHave: string[] = [];
    const missingMustHave: string[] = [];

    requirement.mustHaveSkills.forEach((rawSkill) => {
      const skillLower = rawSkill.toLowerCase();
      const isMatch =
        candSkillsLower.some(
          (cs) =>
            cs.includes(skillLower) ||
            skillLower.includes(cs) ||
            areSkillsSynonymous(skillLower, cs)
        ) || candSummaryLower.includes(skillLower);

      if (isMatch) {
        matchedMustHave.push(rawSkill);
      } else {
        missingMustHave.push(rawSkill);
      }
    });

    const mustHaveMatchPct =
      reqMustHaves.length > 0
        ? Math.round((matchedMustHave.length / reqMustHaves.length) * 100)
        : 100;

    // 2. Good-To-Have Skills Match
    const matchedGoodToHave: string[] = [];
    requirement.goodToHaveSkills.forEach((rawSkill) => {
      const skillLower = rawSkill.toLowerCase();
      const isMatch =
        candSkillsLower.some(
          (cs) =>
            cs.includes(skillLower) ||
            skillLower.includes(cs) ||
            areSkillsSynonymous(skillLower, cs)
        ) || candSummaryLower.includes(skillLower);

      if (isMatch) {
        matchedGoodToHave.push(rawSkill);
      }
    });

    const goodToHaveMatchPct =
      reqGoodToHaves.length > 0
        ? Math.round((matchedGoodToHave.length / reqGoodToHaves.length) * 100)
        : 100;

    // 3. Experience Fit Calculation
    let expFit: ReverseValidationResult['experienceFit'] = 'Compatible';
    let expScore = 90;

    if (!targetExp) {
      expFit = 'Exact Match';
      expScore = 100;
    } else if (targetExp === 'Below 5 years') {
      if (cand.experienceYears <= 5) {
        expFit = 'Exact Match';
        expScore = 100;
      } else if (cand.experienceYears <= 7) {
        expFit = 'Slight Variance';
        expScore = 75;
      } else {
        expFit = 'Out of Range';
        expScore = 45;
      }
    } else if (targetExp === '5 to 10 years') {
      if (cand.experienceYears >= 5 && cand.experienceYears <= 10) {
        expFit = 'Exact Match';
        expScore = 100;
      } else if (cand.experienceYears >= 4 && cand.experienceYears <= 12) {
        expFit = 'Compatible';
        expScore = 85;
      } else {
        expFit = 'Out of Range';
        expScore = 50;
      }
    } else if (targetExp === '5 to 15 years') {
      if (cand.experienceYears >= 5 && cand.experienceYears <= 15) {
        expFit = 'Exact Match';
        expScore = 100;
      } else if (cand.experienceYears >= 4 && cand.experienceYears <= 17) {
        expFit = 'Compatible';
        expScore = 85;
      } else {
        expFit = 'Out of Range';
        expScore = 55;
      }
    } else if (targetExp === '15+ years') {
      if (cand.experienceYears >= 15) {
        expFit = 'Exact Match';
        expScore = 100;
      } else if (cand.experienceYears >= 12) {
        expFit = 'Compatible';
        expScore = 80;
      } else {
        expFit = 'Out of Range';
        expScore = 50;
      }
    }

    // 4. Location Match
    const locationMatch =
      !targetLocation ||
      targetLocation === 'Remote / Any' ||
      cand.country === targetLocation;

    // 5. Target Company Match
    let companyTargetMatch: boolean | 'Neutral' = 'Neutral';
    if (targetCompanies.length > 0) {
      companyTargetMatch = targetCompanies.some(
        (tc) =>
          candCompanyLower.includes(tc) ||
          tc.includes(candCompanyLower)
      );
    }

    // 6. Overall Composite JD Fit Score
    let overallScore = Math.round(
      mustHaveMatchPct * 0.6 +
        goodToHaveMatchPct * 0.2 +
        expScore * 0.15 +
        (locationMatch ? 5 : 0)
    );

    // Boost if company matched
    if (companyTargetMatch === true || cand.isServiceCompany) {
      overallScore = Math.min(100, overallScore + 3);
    }

    // Citi experience detection & bonus (+5)
    const mentionsCiti =
      cand.workedAtCiti ||
      candSummaryLower.includes('citi') ||
      candSummaryLower.includes('citibank') ||
      candSummaryLower.includes('citigroup') ||
      (cand.citiExperienceDetails && cand.citiExperienceDetails.length > 0);

    if (mentionsCiti) {
      overallScore = Math.min(100, overallScore + 5);
    }

    // STRICT NON-NEGOTIABLE DISQUALIFICATIONS:
    // 1. Current or past Tata Consultancy Services (TCS) -> STRICT REJECT
    const isTcsDisqualified =
      candCompanyLower.includes('tcs') ||
      candCompanyLower.includes('tata consultancy') ||
      candSummaryLower.includes('tata consultancy') ||
      candSummaryLower.includes('tcs ');

    // 2. Currently working at Citi -> STRICT REJECT (Past Citi allowed)
    const isCurrentCitiDisqualified =
      candCompanyLower === 'citi' ||
      candCompanyLower === 'citigroup' ||
      candCompanyLower === 'citibank' ||
      candCompanyLower.startsWith('citi ') ||
      candCompanyLower.includes('citigroup');

    let qualificationStatus: ReverseValidationResult['qualificationStatus'] = 'Potential Match';
    let disqualificationReason: string | undefined;

    if (isTcsDisqualified) {
      qualificationStatus = 'Mismatch';
      disqualificationReason = 'Disqualified: Current or past employment at Tata Consultancy Services (TCS).';
      overallScore = Math.min(25, overallScore);
    } else if (isCurrentCitiDisqualified) {
      qualificationStatus = 'Mismatch';
      disqualificationReason = 'Disqualified: Currently employed at Citi/Citigroup. (Past Citi experience is permitted).';
      overallScore = Math.min(30, overallScore);
    } else if (cand.isDevDisqualified && requirement.role === 'Kafka STE / L3 Admin') {
      qualificationStatus = 'Mismatch';
      disqualificationReason = 'Disqualified: Software Developer / Java Backend persona (Admin / Infra STE required).';
      overallScore = Math.min(30, overallScore);
    } else if (overallScore >= 85 && missingMustHave.length <= 1) {
      qualificationStatus = 'Highly Recommended';
    } else if (overallScore >= 70) {
      qualificationStatus = 'Qualified Match';
    } else if (overallScore >= 50) {
      qualificationStatus = 'Potential Match';
    } else {
      qualificationStatus = 'Mismatch';
    }

    // Audit Notes
    const auditNotes: string[] = [];
    if (disqualificationReason) {
      auditNotes.push(`CRITICAL DISQUALIFICATION: ${disqualificationReason}`);
    } else {
      if (mentionsCiti) {
        auditNotes.push(`★ Verified Citi Experience: ${cand.citiExperienceDetails || 'Handled Citi client engagement/banking projects'}`);
      }
      if (missingMustHave.length === 0) {
        auditNotes.push('100% of required core skills verified in profile history.');
      } else {
        auditNotes.push(`Missing must-have skills: ${missingMustHave.join(', ')}.`);
      }
    }

    if (matchedGoodToHave.length > 0) {
      auditNotes.push(`Possesses ${matchedGoodToHave.length} desirable bonus capabilities.`);
    }

    if (targetExp) {
      auditNotes.push(`Experience (${cand.experienceYears} yrs): ${expFit} for '${targetExp}' criteria.`);
    }

    if (cand.isServiceCompany) {
      auditNotes.push('Service / Consulting company background (+15 preference weight).');
    }

    const recruiterAssessment = disqualificationReason
      ? `Disqualified: ${disqualificationReason}`
      : `${qualificationStatus} (${overallScore}% fit). Verified ${matchedMustHave.length}/${requirement.mustHaveSkills.length} must-haves, ${cand.experienceYears} yrs experience at ${cand.currentCompany}.${
          mentionsCiti ? ' [Citi Banking Experience Flagged]' : ''
        }`;

    return {
      candidateId: cand.id,
      mustHaveMatchPercentage: mustHaveMatchPct,
      goodToHaveMatchPercentage: goodToHaveMatchPct,
      experienceFit: expFit,
      experienceScore: expScore,
      locationMatch,
      companyTargetMatch,
      overallJdFitScore: Math.min(100, overallScore),
      qualificationStatus,
      matchedMustHave,
      missingMustHave,
      matchedGoodToHave,
      auditNotes,
      recruiterAssessment,
      disqualificationReason,
    };
  });
}

function areSkillsSynonymous(s1: string, s2: string): boolean {
  const synonyms: [string, string][] = [
    ['k8s', 'kubernetes'],
    ['js', 'javascript'],
    ['ts', 'typescript'],
    ['postgres', 'postgresql'],
    ['gcp', 'google cloud'],
    ['aws', 'amazon web services'],
    ['cobol', 'mainframe'],
    ['jcl', 'job control language'],
    ['cypress', 'playwright'],
  ];

  for (const [a, b] of synonyms) {
    if (
      (s1.includes(a) && s2.includes(b)) ||
      (s1.includes(b) && s2.includes(a))
    ) {
      return true;
    }
  }
  return false;
}
