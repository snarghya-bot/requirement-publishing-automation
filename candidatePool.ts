import { CandidateProfile, SourcingRequirement } from '../types';

interface RolePoolConfig {
  role: string;
  titles: string[];
  mustHaves: string[];
  goodToHaves: string[];
  summaries: string[];
  citiSummaries: string[];
}

const INDIAN_NAMES = [
  'Aarav Sharma',
  'Priya Sundaram',
  'Rohan Mukherjee',
  'Sneha Kulkarni',
  'Vikramaditya Rao',
  'Ananya Iyer',
  'Karthik Venkataraman',
  'Divya Nair',
  'Siddharth Patel',
  'Meera Deshmukh',
  'Aditya Banerjee',
  'Pooja Hegde',
  'Varun Nambiar',
  'Ritu Chatterjee',
  'Suresh Kannan',
  'Swati Bhattacharya',
  'Deepak Reddy',
  'Kavita Joshi',
  'Manish Verma',
  'Shalini Sen',
  'Rajesh Ganesan',
  'Tanvi Saxena',
  'Arun Prasad',
  'Bhavna Mehta',
  'Naveen Chidambaram',
];

const SERVICE_COMPANIES = [
  'Cognizant',
  'Infosys',
  'Wipro',
  'Capgemini',
  'Accenture',
  'IBM India',
  'Tech Mahindra',
  'Mindtree (LTIMindtree)',
  'Hexaware Technologies',
  'Mphasis',
  'CGI',
  'Syntel',
];

const LOCATIONS = [
  'Chennai, Tamil Nadu, India',
  'Bengaluru, Karnataka, India',
  'Hyderabad, Telangana, India',
  'Pune, Maharashtra, India',
  'Gurugram / Noida, Delhi NCR, India',
  'Kolkata, West Bengal, India',
  'Mumbai, Maharashtra, India',
];

export function generateCandidatePoolForRole(
  role: string,
  req?: Partial<SourcingRequirement>
): CandidateProfile[] {
  const mustHaves = req?.mustHaveSkills && req.mustHaveSkills.length > 0
    ? req.mustHaveSkills
    : ['Core Java', 'Spring Boot', 'Microservices', 'REST APIs', 'Hibernate/JPA', 'SQL/PostgreSQL'];

  const goodToHaves = req?.goodToHaveSkills && req.goodToHaveSkills.length > 0
    ? req.goodToHaveSkills
    : ['Kafka', 'Docker/Kubernetes', 'AWS', 'CI/CD Pipeline', 'Redis', 'Unit Testing (JUnit/Mockito)'];

  const targetCompanies = req?.targetCompanies && req.targetCompanies.length > 0
    ? req.targetCompanies
    : SERVICE_COMPANIES;

  const experienceRange = req?.experienceRange || '5 to 10 years';

  const candidates: CandidateProfile[] = [];

  for (let i = 0; i < 20; i++) {
    const name = INDIAN_NAMES[i % INDIAN_NAMES.length];
    const company = targetCompanies[i % targetCompanies.length];
    const location = LOCATIONS[i % LOCATIONS.length];

    // Compute realistic YoE
    let yoe = 5.5 + ((i * 1.3) % 6.5);
    if (experienceRange === 'Below 5 years') {
      yoe = 3.0 + ((i * 0.7) % 2.0);
    } else if (experienceRange === '5 to 10 years') {
      yoe = 5.2 + ((i * 0.8) % 4.8);
    } else if (experienceRange === '5 to 15 years') {
      yoe = 6.0 + ((i * 1.4) % 8.5);
    } else if (experienceRange === '15+ years') {
      yoe = 15.0 + ((i * 1.1) % 7.0);
    }
    yoe = Math.round(yoe * 10) / 10;

    // Determine Citi past exposure
    const hasCiti = i === 1 || i === 4 || i === 7 || i === 11 || i === 16;
    const citiDetails = hasCiti
      ? `Past engagement via ${company}: Deputed to Citi Global Consumer Technology (GCT) core applications for ${Math.round(1.5 + (i % 3))} years.`
      : 'None';

    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const emailPrefix = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
    const runNonce = Math.random().toString(36).slice(2, 8);

    // Pick candidate skill combinations
    const candMustHaves = i % 5 === 4
      ? mustHaves.slice(0, Math.max(1, mustHaves.length - 2))
      : mustHaves.slice(0, mustHaves.length - (i % 2));

    const candGoodToHaves = goodToHaves.slice(0, 1 + (i % goodToHaves.length));
    const candSkills = Array.from(new Set([...candMustHaves, ...candGoodToHaves]));

    const titlePrefix = yoe >= 10 ? 'Lead / Senior Staff' : yoe >= 7 ? 'Senior' : 'Specialist';
    const currentRole = `${titlePrefix} ${role}`;

    const summary = hasCiti
      ? `${currentRole} at ${company} with ${yoe} years of hands-on experience in ${candSkills.slice(0, 4).join(', ')}. Led core banking services delivery with past project deployment on Citi enterprise platforms.`
      : `${currentRole} at ${company} with ${yoe} years of extensive industry experience specializing in ${candSkills.slice(0, 5).join(', ')}. Strong background in scalable architecture, peer code reviews, and high-volume systems.`;

    candidates.push({
      id: `demo-${role.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${i + 1}-${runNonce}`,
      name: `[DEMO] ${name}`,
      email: `${emailPrefix}@${company.toLowerCase().replace(/[^a-z0-9]/g, '')}-talent.com`,
      phone: `+91 9840${(i + 1).toString().padStart(2, '0')} ${Math.floor(1000 + i * 423)}`,
      currentRole,
      currentCompany: company,
      experienceYears: yoe,
      location,
      country: 'India',
      skills: candSkills,
      summary: `[SYNTHETIC DEMO PROFILE -- not a real person] ${summary}`,
      education: 'Bachelor of Technology in Computer Science & Engineering',
      // Deliberately not a linkedin.com URL -- this is fabricated demo data, not a real profile.
      profileSourceUrl: `https://example.invalid/synthetic-demo-profile/${slug}`,
      sourcedFrom: `SYNTHETIC DEMO DATA (no live Crustdata source) • ${company}`,
      isServiceCompany: true,
      isSynthetic: true,
      workedAtCiti: hasCiti,
      citiExperienceDetails: citiDetails,
    });
  }

  return candidates;
}
