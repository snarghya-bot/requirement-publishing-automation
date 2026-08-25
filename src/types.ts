export type StandardRoleType =
  | 'Java Developer'
  | '.NET Developer'
  | 'DevOps'
  | 'Production Support'
  | 'Unix/SQL/Autosys'
  | 'Cloud'
  | 'Mainframe Developer/Support'
  | 'Automation Test Engineer'
  | 'Kafka STE / L3 Admin';

export type RoleType = StandardRoleType | string;

export type ExperienceRange =
  | ''
  | 'Below 5 years'
  | '5 to 10 years'
  | '5 to 15 years'
  | '15+ years';

export type LocationType = 'India' | 'USA' | 'Canada' | 'UK' | 'Remote / Any';

export interface RoleConfig {
  role: RoleType;
  title: string;
  defaultJd: string;
  defaultMustHaveSkills: string[];
  defaultGoodToHaveSkills: string[];
  isCustom?: boolean;
  isModified?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface SourcingRequirement {
  role: RoleType | '';
  customJd: string;
  mustHaveSkills: string[];
  goodToHaveSkills: string[];
  experienceRange: ExperienceRange;
  location: LocationType;
  targetCompanies: string[]; // can be empty
  notes?: string;
  disqualifyCaptiveBanks?: boolean;
  disqualifyTCS?: boolean;
  searchCitiExperience?: boolean;
}

export interface GoogleVerificationResult {
  status: 'VERIFIED_MATCH' | 'FLAGGED_DISCREPANCY' | 'PARTIALLY_VERIFIED' | 'NOT_CHECKED';
  verifiedCompany?: string;
  companyMatch: boolean;
  verifiedLocation?: string;
  locationMatch: boolean;
  verifiedSkills?: string[];
  skillsMatchConfidence: number;
  searchQueryUsed?: string;
  guardrailVerdict: string;
  groundingSnippets?: string[];
  checkedAt: string;
}

export interface CandidateProfile {
  id: string;
  name: string;
  currentRole: string;
  currentCompany: string;
  experienceYears: number;
  location: string;
  country: LocationType;
  skills: string[];
  summary: string;
  education: string;
  profileSourceUrl: string;
  sourcedFrom: string;
  isServiceCompany?: boolean;
  isDevDisqualified?: boolean;
  workedAtCiti?: boolean;
  citiExperienceDetails?: string;
  googleVerification?: GoogleVerificationResult;
}

export interface SkillMatchDetail {
  skill: string;
  matched: boolean;
  type: 'must_have' | 'good_to_have';
  relevanceWeight: number;
}

export interface ReverseValidationResult {
  candidateId: string;
  mustHaveMatchPercentage: number;
  goodToHaveMatchPercentage: number;
  experienceFit: 'Exact Match' | 'Compatible' | 'Slight Variance' | 'Out of Range';
  experienceScore: number;
  locationMatch: boolean;
  companyTargetMatch: boolean | 'Neutral';
  overallJdFitScore: number; // 0 - 100
  qualificationStatus: 'Highly Recommended' | 'Qualified Match' | 'Potential Match' | 'Mismatch';
  matchedMustHave: string[];
  missingMustHave: string[];
  matchedGoodToHave: string[];
  auditNotes: string[];
  recruiterAssessment?: string;
  disqualificationReason?: string;
}

export interface EmailDispatchPayload {
  recipientEmail: string;
  ccEmail?: string;
  subject: string;
  includePythonScript: boolean;
  includeValidationTelemetry: boolean;
  selectedCandidateIds: string[];
  additionalNotes?: string;
}

export interface SentEmailRecord {
  id: string;
  sentAt: string;
  recipient: string;
  subject: string;
  candidateCount: number;
  role: string;
  status: 'Delivered' | 'Pending';
}
