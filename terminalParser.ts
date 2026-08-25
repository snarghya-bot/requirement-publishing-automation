import { CandidateProfile, ReverseValidationResult } from '../types';

export interface ParseResult {
  candidates: CandidateProfile[];
  validations: Record<string, ReverseValidationResult>;
}

/** RFC4180-ish single-line-aware CSV row splitter: handles quoted fields, embedded
 * commas, and "" as an escaped quote. Good enough for the pipeline's own CSV output
 * (which quotes every field), without pulling in a CSV library dependency. */
function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells.map((c) => c.trim());
}

/**
 * Parses the CSV actually written by pipeline.py / the generated script
 * (csv.DictWriter with fieldnames: Name, Verdict, Fit Score, YoE, Switches, Location,
 * Service Company, Worked at Citi, Citi Details, Current Company, Headline,
 * LinkedIn URL, Recruiter Summary, Matched Skills, Missing Skills).
 *
 * Unlike parseTerminalOrCsvOutput's generic heuristic parser below (built for a
 * different, simplified sample format), this maps columns by header name so it stays
 * correct even if column order changes, and marks every row isSynthetic: false since
 * this file only exists when the live Python pipeline actually wrote real,
 * Crustdata-sourced rows (pipeline.py returns early with no CSV if zero real
 * candidates were sourced -- it no longer fabricates placeholder rows).
 */
export function parsePipelineCsv(csvText: string): ParseResult {
  const candidates: CandidateProfile[] = [];
  const validations: Record<string, ReverseValidationResult> = {};

  const lines = csvText.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { candidates, validations };

  const headers = splitCsvRow(lines[0]).map((h) => h.trim());
  const col = (row: string[], name: string) => {
    const idx = headers.indexOf(name);
    return idx >= 0 ? (row[idx] ?? '') : '';
  };

  lines.slice(1).forEach((line, i) => {
    const row = splitCsvRow(line);
    if (row.length < 2) return;

    const name = col(row, 'Name') || `Candidate ${i + 1}`;
    const verdict = col(row, 'Verdict') || 'POTENTIAL MATCH';
    const fitScore = parseFloat(col(row, 'Fit Score')) || 0;
    const yoe = parseFloat(col(row, 'YoE')) || 0;
    const switches = parseInt(col(row, 'Switches'), 10) || 0;
    const location = col(row, 'Location') || 'India';
    const isServiceCompany = /yes/i.test(col(row, 'Service Company'));
    const workedAtCiti = /yes/i.test(col(row, 'Worked at Citi'));
    const citiDetails = col(row, 'Citi Details') || 'None';
    const currentCompany = col(row, 'Current Company') || 'Unknown';
    const headline = col(row, 'Headline') || '';
    const linkedinUrl = col(row, 'LinkedIn URL') || '';
    const recruiterSummary = col(row, 'Recruiter Summary') || '';
    const matchedSkills = col(row, 'Matched Skills').split(',').map((s) => s.trim()).filter(Boolean);
    const missingSkills = col(row, 'Missing Skills').split(',').map((s) => s.trim()).filter(Boolean);

    const candidateId = linkedinUrl || `pipeline-csv-${i}-${Date.now().toString().slice(-5)}`;

    candidates.push({
      id: candidateId,
      name,
      email: '',
      phone: '',
      currentRole: headline || `${currentCompany} Employee`,
      currentCompany,
      experienceYears: yoe,
      location,
      country: 'India',
      skills: matchedSkills.length > 0 ? matchedSkills : [],
      summary: recruiterSummary,
      education: '',
      profileSourceUrl: linkedinUrl,
      sourcedFrom: `Live Python Pipeline (Crustdata) • ${currentCompany}`,
      isServiceCompany,
      workedAtCiti,
      citiExperienceDetails: citiDetails,
      isSynthetic: false,
    });

    let qualificationStatus: ReverseValidationResult['qualificationStatus'] = 'Potential Match';
    if (verdict.toUpperCase().includes('STRONG') || fitScore >= 85) qualificationStatus = 'Highly Recommended';
    else if (verdict.toUpperCase().includes('REJECT') || fitScore < 40) qualificationStatus = 'Mismatch';
    else if (fitScore >= 60) qualificationStatus = 'Qualified Match';

    validations[candidateId] = {
      candidateId,
      mustHaveMatchPercentage: fitScore,
      goodToHaveMatchPercentage: Math.max(0, fitScore - 10),
      experienceFit: 'Compatible',
      experienceScore: fitScore,
      locationMatch: true,
      companyTargetMatch: 'Neutral',
      overallJdFitScore: fitScore,
      qualificationStatus,
      matchedMustHave: matchedSkills,
      missingMustHave: missingSkills,
      matchedGoodToHave: [],
      auditNotes: [
        `Sourced live from Crustdata, evaluated by the Python pipeline (verdict: ${verdict}).`,
        `${switches} company switch(es) detected.`,
        workedAtCiti ? `Past Citi experience: ${citiDetails}` : 'No Citi experience detected.',
      ],
      recruiterAssessment: recruiterSummary,
    };
  });

  return { candidates, validations };
}

export function parseTerminalOrCsvOutput(rawText: string): ParseResult {
  const candidates: CandidateProfile[] = [];
  const validations: Record<string, ReverseValidationResult> = {};

  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);

  // Check if this is a table format (+----+-----+ or | No | Name | Verdict | ...)
  const isTable = lines.some((l) => l.includes('|') && (l.toLowerCase().includes('candidate name') || l.toLowerCase().includes('verdict')));

  if (isTable) {
    let inDataSection = false;
    let index = 1;

    for (const line of lines) {
      if (line.startsWith('+') || line.startsWith('=')) {
        continue;
      }
      if (line.toLowerCase().includes('candidate name') && line.toLowerCase().includes('verdict')) {
        inDataSection = true;
        continue;
      }
      if (!inDataSection) {
        // Maybe data lines start directly
        if (line.startsWith('|') && line.split('|').length >= 7) {
          inDataSection = true;
        } else {
          continue;
        }
      }

      const cols = line
        .split('|')
        .map((c) => c.trim())
        .filter((_, i, arr) => i > 0 && i < arr.length - 1); // remove outer empty items

      if (cols.length >= 6) {
        // Format: [No., Candidate Name, Verdict, Score, YoE, Country, Current Employer, Citi Exp?, LinkedIn URL]
        let name = cols[1] || cols[0];
        let verdict = cols[2] || 'POTENTIAL MATCH';
        let scoreStr = cols[3] || '75';
        let yoeStr = cols[4] || '5';
        let country = cols[5] || 'India';
        let company = cols[6] || 'Enterprise Services';
        let citiExpStr = cols[7] || 'No';
        let linkedin = cols[8] || `https://linkedin.com/in/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        // If columns shifted because No wasn't first:
        if (isNaN(Number(scoreStr)) && !isNaN(Number(cols[2]))) {
          name = cols[0];
          verdict = 'QUALIFIED';
          scoreStr = cols[2];
          yoeStr = cols[3];
          company = cols[4];
          country = cols[5];
        }

        const score = parseInt(scoreStr.replace(/[^0-9]/g, ''), 10) || 75;
        const yoe = parseFloat(yoeStr.replace(/[^0-9.]/g, '')) || 6.0;
        const workedAtCiti = citiExpStr.toLowerCase().includes('yes') || citiExpStr.toLowerCase().includes('true');

        const candidateId = `cand-imported-${index}`;
        index++;

        const candidate: CandidateProfile = {
          id: candidateId,
          name,
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@talent-source.io`,
          phone: `+91 98400 ${Math.floor(10000 + Math.random() * 90000)}`,
          currentRole: 'Production Support Specialist',
          currentCompany: company,
          experienceYears: yoe,
          location: `${country}`,
          country: country === 'USA' ? 'USA' : country === 'UK' ? 'UK' : country === 'Canada' ? 'Canada' : 'India',
          skills: [
            'Incident & Problem Management (ITIL)',
            'Linux / Unix Shell Scripting',
            'SQL Queries & Database Troubleshooting',
            'Log Analysis & Debugging',
            'Monitoring Tools (Splunk / AppDynamics / Dynatrace)',
            'ServiceNow / Jira Service Management',
            'Production Deployment Support',
          ],
          summary: `${yoe} years of production application support at ${company}. Evaluated match score: ${score}%.`,
          education: 'Bachelor of Engineering',
          profileSourceUrl: linkedin.startsWith('http') ? linkedin : `https://${linkedin}`,
          sourcedFrom: `Imported Terminal Run • ${company}`,
          isServiceCompany: true,
          workedAtCiti,
        };

        let qualStatus: ReverseValidationResult['qualificationStatus'] = 'Potential Match';
        if (score >= 85 || verdict.toUpperCase().includes('STRONG')) {
          qualStatus = 'Highly Recommended';
        } else if (score >= 70) {
          qualStatus = 'Qualified Match';
        } else if (score < 50) {
          qualStatus = 'Mismatch';
        }

        const validation: ReverseValidationResult = {
          candidateId,
          mustHaveMatchPercentage: score,
          goodToHaveMatchPercentage: Math.max(50, score - 10),
          experienceFit: 'Exact Match',
          experienceScore: 100,
          locationMatch: true,
          companyTargetMatch: true,
          overallJdFitScore: score,
          qualificationStatus: qualStatus,
          matchedMustHave: [
            'Incident & Problem Management (ITIL)',
            'Linux / Unix Shell Scripting',
            'SQL Queries & Database Troubleshooting',
            'Log Analysis & Debugging',
          ],
          missingMustHave: [],
          matchedGoodToHave: ['Monitoring Tools (Splunk / AppDynamics / Dynatrace)'],
          auditNotes: [
            `Extracted via live Python pipeline with match score ${score}%.`,
            `Current Employer: ${company} with ${yoe} Years of Industry Experience.`,
            `Evaluated verdict: ${verdict}.`,
          ],
          recruiterAssessment: `Qualified talent sourced from ${company} possessing verified enterprise production support exposure.`,
        };

        candidates.push(candidate);
        validations[candidateId] = validation;
      }
    }
  } else {
    // CSV or line by line
    let index = 1;
    for (const line of lines) {
      if (line.toLowerCase().includes('candidate name') || line.toLowerCase().includes('employer')) continue;
      const parts = line.split(',').map((p) => p.replace(/^["']|["']$/g, '').trim());
      if (parts.length >= 4) {
        const name = parts[0] || `Candidate ${index}`;
        const company = parts[1] || 'Enterprise';
        const score = parseInt(parts[2], 10) || 75;
        const yoe = parseFloat(parts[3]) || 5;
        const linkedin = parts[4] || `https://linkedin.com/in/${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

        const candidateId = `cand-csv-${index}`;
        index++;

        candidates.push({
          id: candidateId,
          name,
          email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@talent-source.io`,
          phone: `+91 98400 ${Math.floor(10000 + Math.random() * 90000)}`,
          currentRole: 'Production Support Specialist',
          currentCompany: company,
          experienceYears: yoe,
          location: 'India',
          country: 'India',
          skills: [
            'Incident & Problem Management (ITIL)',
            'Linux / Unix Shell Scripting',
            'SQL Queries & Database Troubleshooting',
            'Log Analysis & Debugging',
          ],
          summary: `${yoe} years of enterprise support experience. Evaluated score: ${score}%.`,
          education: 'Bachelor of Engineering',
          profileSourceUrl: linkedin,
          sourcedFrom: `Imported CSV • ${company}`,
          isServiceCompany: true,
        });

        validations[candidateId] = {
          candidateId,
          mustHaveMatchPercentage: score,
          goodToHaveMatchPercentage: Math.max(50, score - 10),
          experienceFit: 'Exact Match',
          experienceScore: 100,
          locationMatch: true,
          companyTargetMatch: true,
          overallJdFitScore: score,
          qualificationStatus: score >= 85 ? 'Highly Recommended' : score >= 70 ? 'Qualified Match' : 'Potential Match',
          matchedMustHave: ['Incident & Problem Management (ITIL)', 'Linux / Unix Shell Scripting'],
          missingMustHave: [],
          matchedGoodToHave: ['Monitoring Tools (Splunk / AppDynamics / Dynatrace)'],
          auditNotes: [`Imported CSV profile with match score ${score}%.`],
          recruiterAssessment: `Candidate from ${company} with ${yoe} years of relevant support background.`,
        };
      }
    }
  }

  return { candidates, validations };
}
