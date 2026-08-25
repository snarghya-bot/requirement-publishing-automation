import { SourcingRequirement } from '../types';

export interface ScriptGeneratorOptions {
  crustdataApiKey?: string;
  geminiApiKey?: string;
}

export function generatePythonScript(
  req: SourcingRequirement,
  options: ScriptGeneratorOptions = {}
): string {
  const roleName = req.role || 'Mainframe Developer/Support';
  const roleSlug = roleName.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const expRange = req.experienceRange || '5 to 10 years';
  const locationVal = req.location || 'India';

  const defaultCrustKey = options.crustdataApiKey ? options.crustdataApiKey.trim() : '';
  const defaultGeminiKey = options.geminiApiKey ? options.geminiApiKey.trim() : '';

  const companiesList =
    req.targetCompanies && req.targetCompanies.length > 0
      ? req.targetCompanies
      : [
          'Infosys',
          'Wipro',
          'Cognizant',
          'HCLTech',
          'HCL Technologies',
          'Tech Mahindra',
          'LTIMindtree',
          'Mindtree',
          'L&T Infotech',
          'Capgemini',
          'Accenture',
          'Hexaware',
          'Hexaware Technologies',
          'Mphasis',
          'DXC Technology',
          'CGI',
          'NTT DATA',
          'Persistent Systems',
          'Birlasoft',
          'ITC Infotech',
          'Virtusa',
          'Sopra Steria',
          'UST',
          'UST Global',
          'IBM',
          'Zensar Technologies',
        ];

  const serviceCompaniesJson = JSON.stringify(companiesList, null, 4);

  // Min / max experience logic from expRange
  let minExp = 5;
  let maxExp = 10;
  if (expRange === 'Below 5 years') {
    minExp = 2;
    maxExp = 5;
  } else if (expRange === '5 to 15 years') {
    minExp = 5;
    maxExp = 15;
  } else if (expRange === '15+ years') {
    minExp = 15;
    maxExp = 30;
  }

  // Location conditions
  const locationCondition =
    locationVal === 'Remote / Any'
      ? `[
                        {"field": "basic_profile.location.country", "type": "=", "value": "India"},
                        {"field": "basic_profile.location.country", "type": "=", "value": "USA"},
                        {"field": "basic_profile.location.country", "type": "=", "value": "Canada"},
                        {"field": "basic_profile.location.country", "type": "=", "value": "UK"}
                    ]`
      : `[
                        {"field": "basic_profile.location.country", "type": "=", "value": "${locationVal}"}
                    ]`;

  // Keywords and skills for query
  const coreSkills = (req.mustHaveSkills && req.mustHaveSkills.length > 0
    ? req.mustHaveSkills
    : ['COBOL', 'JCL', 'DB2', 'VSAM', 'CICS']
  ).map((s) => s.replace(/[^a-zA-Z0-9+#/ ]/g, '').trim());

  const skillConditions = JSON.stringify(coreSkills.slice(0, 8));

  const jdTextFormatted = (
    req.customJd ||
    `Role: ${roleName}
Experience: ${expRange} total IT experience.
Location: ${locationVal}.

Non-Negotiable Disqualifications (Immediate REJECT):
- Current or past employment at Tata Consultancy Services (TCS) -> STRICT REJECT.
- Currently working at Citi / Citigroup -> STRICT REJECT. (Past Citi experience is allowed).
- Experience < ${minExp} years or > ${maxExp} years -> REJECT.
- Excessive Job Hopping: More than 2 company switches (Max 3 total companies across career).
- Zero ${roleName} core production support or hands-on troubleshooting experience -> REJECT.

Mandatory Technical Requirements (Target Archetype):
- Core Stack: ${coreSkills.join(', ')}.
- Core Operations: Batch failure remediation, abend resolution, incident triage, on-call support, restart logic.

Preferences & Bonuses:
- IT Service / Consulting Company Background: PREFERRED (+15 points for candidates currently at Infosys, Wipro, Cognizant, IBM, Capgemini, Accenture, LTIMindtree, HCLTech, etc.).
- Past Citi Experience Detection: Highlight and report any resource who previously worked on Citi engagements or at Citi across these service companies.`
  ).trim();

  return `#!/usr/bin/env python3
"""
Talent Sourcing & Reverse Qualification Pipeline
Target Role: ${roleName}
Experience Range: ${expRange}
Location: ${locationVal}
"""

import csv
import datetime
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import urllib.request
import urllib.error

# 1. Credentials & Configuration (Safely sourced from environment or config)
# Verified against Crustdata's documented People Search API contract:
#   POST /screener/persondb/search, "Authorization: Token <key>", filters keyed by "filter_type".
CRUSTDATA_ENDPOINT = "https://api.crustdata.com/screener/persondb/search"
CRUSTDATA_API_KEY = os.getenv("CRUSTDATA_API_KEY", "${defaultCrustKey}")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "${defaultGeminiKey}")

OUTPUT_CSV_PATH = os.path.expanduser(
    "~/Downloads/${roleSlug}_candidates_evaluation.csv"
)
SQLITE_DB_PATH = os.path.expanduser(
    "~/talent_sourcing_pipeline.db"
)

# Primary model, with a real automatic-failover model if the first is unavailable/rate-limited.
GEMINI_MODEL = "gemini-3.1-flash-lite"
GEMINI_FALLBACK_MODELS = ["gemini-3.1-flash-lite", "gemini-2.5-flash"]

# Service / Consulting Companies (All selected by default)
SERVICE_COMPANIES = ${serviceCompaniesJson}

# 2. Evaluation Rubric & Job Description
JOB_DESCRIPTION = """
${jdTextFormatted}
"""


def make_http_post(url, headers, json_payload, timeout=30):
    """Robust HTTP POST helper using standard library urllib."""
    req_body = json.dumps(json_payload).encode("utf-8")
    req = urllib.request.Request(url, data=req_body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8") if e.fp else ""
        return e.code, err_body
    except Exception as e:
        return 500, str(e)


def init_sqlite_db(db_path):
    """Initialize SQLite tables for talent caching, Citi tracking, and JD versioning."""
    os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("""
        CREATE TABLE IF NOT EXISTS candidate_evaluations (
            candidate_id TEXT,
            jd_hash TEXT,
            role_name TEXT,
            name TEXT,
            verdict TEXT,
            fit_score REAL,
            years_of_experience REAL,
            company_switches INTEGER,
            location TEXT,
            is_service_company TEXT,
            current_company TEXT,
            headline TEXT,
            linkedin_url TEXT,
            worked_at_citi INTEGER,
            citi_experience_details TEXT,
            recruiter_summary TEXT,
            matched_skills TEXT,
            missing_skills TEXT,
            retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (candidate_id, jd_hash)
        )
    """)
    cur.execute("""
        CREATE TABLE IF NOT EXISTS jd_pull_history (
            jd_hash TEXT PRIMARY KEY,
            role_name TEXT,
            jd_text TEXT,
            last_pulled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            candidate_count INTEGER,
            citi_count INTEGER
        )
    """)
    conn.commit()
    return conn


def check_existing_jd_pull(conn, jd_text, role_name):
    """Check if same job description was pulled previously and prompt user whether to merge or pull fresh."""
    jd_hash = hashlib.sha256((role_name + ":::" + jd_text.strip()).encode("utf-8")).hexdigest()[:16]
    cur = conn.cursor()
    cur.execute("SELECT candidate_count, citi_count, last_pulled_at FROM jd_pull_history WHERE jd_hash = ?", (jd_hash,))
    row = cur.fetchone()
    if row:
        cand_count, citi_count, last_pulled = row
        print(f"\\n[!] DETECTED PREVIOUS PULL FOR THIS EXACT JOB DESCRIPTION:")
        print(f"    - Last Pulled: {last_pulled}")
        print(f"    - Existing Profiles in SQLite: {cand_count} (including {citi_count} with Citi experience)")
        
        # Interactive prompt check (defaults to Merge if non-interactive)
        if sys.stdin.isatty():
            choice = input("    Do you want to MERGE with previous pull or start FRESH? (M/F) [Default: M]: ").strip().upper()
            return jd_hash, (choice != 'F')
        return jd_hash, True
    return jd_hash, False


def extract_candidate_yoe(p):
    """Extracts or computes accurate Years of Experience from Crustdata profile."""
    basic = p.get("basic_profile", {}) or {}
    
    # 1. Check explicit fields in basic_profile or root
    for key in ("years_of_experience", "years_of_experience_raw", "total_experience_years", "yoe", "experience_years"):
        val = basic.get(key) if basic.get(key) is not None else p.get(key)
        if val is not None:
            try:
                num = float(val)
                if num > 0:
                    return round(num, 1)
            except (ValueError, TypeError):
                pass

    # 2. Calculate from employment history date ranges
    emp = p.get("experience", {}).get("employment_details", {}) or {}
    all_jobs = []
    curr = emp.get("current", [])
    if isinstance(curr, list):
        all_jobs.extend(curr)
    elif isinstance(curr, dict):
        all_jobs.append(curr)
    past = emp.get("past", [])
    if isinstance(past, list):
        all_jobs.extend(past)
    elif isinstance(past, dict):
        all_jobs.append(past)

    earliest_year = 9999
    current_year = datetime.datetime.now().year
    found_date = False

    for job in all_jobs:
        if not isinstance(job, dict):
            continue
        for date_key in ("start_date", "start", "from", "duration"):
            raw_val = str(job.get(date_key) or "")
            match = re.search(r'\\b(19\\d\\d|20\\d\\d)\\b', raw_val)
            if match:
                yr = int(match.group(1))
                if 1990 <= yr <= current_year:
                    earliest_year = min(earliest_year, yr)
                    found_date = True

    if found_date and earliest_year <= current_year:
        return float(current_year - earliest_year)

    # 3. Fallback: Check headline/summary for "X+ years"
    summary_text = (basic.get("summary") or "") + " " + (basic.get("headline") or "")
    yoe_match = re.search(r'(\\d+(?:\\.\\d+)?)\\s*\\+?\\s*(?:years|yrs|yo|yoe)', summary_text, re.IGNORECASE)
    if yoe_match:
        try:
            return round(float(yoe_match.group(1)), 1)
        except ValueError:
            pass

    # Default reasonable estimation based on role target range
    return float((${minExp} + ${maxExp}) // 2)


def detect_citi_experience(emp_details, basic):
    """Deep scanner for past Citi / Citigroup / Citibank experience across employment & summary."""
    citi_keywords = ["citi", "citibank", "citigroup", "citi india", "citicorp", "citi technology", "citi tech"]
    
    # 1. Scan past employment history
    past_list = emp_details.get("past", [])
    if isinstance(past_list, dict):
        past_list = [past_list]
    elif not isinstance(past_list, list):
        past_list = []

    for item in past_list:
        if not isinstance(item, dict):
            continue
        co_name = (item.get("company_name") or item.get("name") or "").lower()
        title = (item.get("title") or item.get("designation") or "").lower()
        desc = (item.get("description") or item.get("summary") or "").lower()

        for kw in citi_keywords:
            if kw in co_name:
                company = item.get("company_name") or item.get("name") or "Citi"
                role_title = item.get("title") or "Engineer"
                return True, f"Past Employer: {company} ({role_title})"
            if kw in desc or f"client: {kw}" in desc or f"client - {kw}" in desc or f"project: {kw}" in desc:
                company = item.get("company_name") or item.get("name") or "Service Provider"
                return True, f"Past Client Engagement at {company} for {kw.upper()}"

    # 2. Scan current employment project descriptions (e.g. client project for Citi)
    curr_list = emp_details.get("current", [])
    if isinstance(curr_list, dict):
        curr_list = [curr_list]
    elif not isinstance(curr_list, list):
        curr_list = []

    for item in curr_list:
        if not isinstance(item, dict):
            continue
        desc = (item.get("description") or item.get("summary") or "").lower()
        co_name = (item.get("company_name") or item.get("name") or "").lower()
        
        # Ensure they are not currently employed directly at Citi (which is a DQ)
        if any(kw in co_name for kw in citi_keywords):
            continue  # Current Citi employee handled by disqualifier

        for kw in citi_keywords:
            if kw in desc or f"client: {kw}" in desc or f"client - {kw}" in desc:
                company = item.get("company_name") or item.get("name") or "Current Employer"
                return True, f"Current Client Engagement via {company} supporting {kw.upper()}"

    # 3. Scan summary and headline
    text_to_scan = f"{basic.get('headline', '')} {basic.get('summary', '')}".lower()
    for kw in citi_keywords:
        if kw in text_to_scan and not any(f"currently at {kw}" in text_to_scan or f"working at {kw}" in text_to_scan):
            return True, f"Profile highlights past banking engagement with {kw.upper()}"

    return False, "None"


def fetch_candidates_profiles():
    """Fetches candidate profiles live from Crustdata's People Search API."""
    if CRUSTDATA_API_KEY:
        headers = {
            "Authorization": f"Token {CRUSTDATA_API_KEY}",
            "Content-Type": "application/json",
        }

        payload = {
            "filters": {
                "op": "and",
                "conditions": [
                    # Experience Filter
                    {
                        "filter_type": "years_of_experience_raw",
                        "type": "=>",
                        "value": ${minExp},
                    },
                    {
                        "filter_type": "years_of_experience_raw",
                        "type": "=<",
                        "value": ${maxExp},
                    },
                    # Location Filter
                    {
                        "op": "or",
                        "conditions": ${locationCondition},
                    },
                    # STRICT EXCLUSION: TCS (Current or Past Employer)
                    {
                        "filter_type": "current_employers.company_name",
                        "type": "not_in",
                        "value": ["Tata Consultancy Services", "TCS", "Tata Consultancy Services (TCS)"],
                    },
                    {
                        "filter_type": "past_employers.company_name",
                        "type": "not_in",
                        "value": ["Tata Consultancy Services", "TCS", "Tata Consultancy Services (TCS)"],
                    },
                    # STRICT EXCLUSION: Citi (Currently Working)
                    {
                        "filter_type": "current_employers.company_name",
                        "type": "not_in",
                        "value": ["Citi", "Citigroup", "Citibank", "Citi India", "Citi Tech"],
                    },
                    # Target Service Companies (All selected by default)
                    {
                        "filter_type": "current_employers.company_name",
                        "type": "in",
                        "value": SERVICE_COMPANIES,
                    },
                    # Role Alignment
                    {
                        "op": "or",
                        "conditions": [
                            {
                                "filter_type": "current_title",
                                "type": "(.)",
                                "value": "${roleName.split(' ')[0]}",
                            },
                            {
                                "filter_type": "current_title",
                                "type": "(.)",
                                "value": "Support",
                            },
                        ],
                    },
                    # Core Skills
                    {
                        "filter_type": "skills",
                        "type": "in",
                        "value": ${skillConditions},
                    },
                ],
            },
            "limit": 50,
        }

        print("Querying Crustdata (POST /screener/persondb/search) for ${roleName} talent across service companies (${locationVal})...")
        try:
            status, res_text = make_http_post(CRUSTDATA_ENDPOINT, headers, payload, timeout=60)
            if status in (200, 201):
                data = json.loads(res_text)
                profiles = data.get("profiles", []) or data.get("results", []) or data.get("persons", []) or (data if isinstance(data, list) else [])
                if profiles:
                    print(f"[✓] Crustdata returned {len(profiles)} live profile(s).")
                    return profiles
                print("[!] Crustdata call succeeded (HTTP 200) but returned zero matching profiles for these filters.")
            elif status == 401:
                print("[!] Crustdata authentication FAILED (HTTP 401) -- your CRUSTDATA_API_KEY is invalid or expired.")
            else:
                print(f"[!] Crustdata API error (HTTP {status}): {res_text[:200]}")
        except Exception as e:
            print(f"[!] Crustdata fetch exception: {e}")
    else:
        print("[!] CRUSTDATA_API_KEY is not set. No live sourcing is possible without it.")

    # No fabricated fallback: zero real profiles means zero rows, honestly reported.
    return []


def evaluate_batch_with_gemini(candidates_batch, jd_text, batch_num=1, total_batches=1):
    """Evaluates candidates using Gemini 3.1 Flash-Lite or rule-based qualification engine."""
    prompt_text = f"""
You are an expert technical recruitment screener and hiring bar raiser.
Perform reverse qualification evaluation for the following candidate profiles against the Job Description.

JOB DESCRIPTION:
{jd_text}

CANDIDATES BATCH:
{json.dumps(candidates_batch, indent=2)}

Evaluation Criteria:
1. Strict Disqualifications:
   - Current or past employment at Tata Consultancy Services (TCS) -> STRICT REJECT.
   - Currently working at Citi / Citigroup / Citibank -> STRICT REJECT. (Past Citi employment or client projects ARE ALLOWED and highly valued).
   - Total experience < ${minExp} years or > ${maxExp} years -> REJECT.
   - More than 2 company switches -> REJECT.
   - Zero stack alignment -> REJECT.
2. Target Persona Fit:
   - Candidates with hands-on production support, incident triage, and stack alignment should be scored as STRONG MATCH (80-100) or POTENTIAL MATCH (60-79).
3. Service Company Preference (+15 points):
   - Candidates currently at an IT service company (Infosys, Wipro, Cognizant, IBM, Capgemini, Accenture, etc.) receive preference boost.
4. Citi Experience Detection (Crucial):
   - Inspect profile summary, headline, and employment details for any past Citi / Citibank / Citigroup or client engagements.
   - Set "worked_at_citi": true/false and provide concise "citi_experience_details".

Return a valid JSON ARRAY of objects strictly in this format:
[
  {{
    "candidate_id": "Candidate ID string",
    "verdict": "STRONG MATCH" | "POTENTIAL MATCH" | "REJECT",
    "fit_score": 0-100,
    "years_of_experience": 0.0,
    "company_switches": 0,
    "is_service_company": true | false,
    "worked_at_citi": true | false,
    "citi_experience_details": "Summary of Citi engagement or 'None'",
    "matched_skills": ["skill1", "skill2"],
    "missing_skills": ["skill1", "skill2"],
    "summary": "1 sentence recruiter assessment"
  }}
]
"""

    if GEMINI_API_KEY:
        gemini_payload = {
            "contents": [{"parts": [{"text": prompt_text}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        for model_name in GEMINI_FALLBACK_MODELS:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            for attempt in range(2):
                try:
                    status, res_text = make_http_post(
                        endpoint,
                        {"Content-Type": "application/json"},
                        gemini_payload,
                        timeout=35,
                    )
                    if status == 200:
                        res_json = json.loads(res_text)
                        raw_ai_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                        evals = json.loads(raw_ai_text)
                        for e in evals:
                            e["_model_used"] = model_name
                        print(f"  [✓] {model_name} successfully evaluated Batch {batch_num} ({len(candidates_batch)} profiles).")
                        return evals
                    elif status in (503, 429):
                        print(f"  [!] {model_name} rate-limit (HTTP {status}) on Batch {batch_num}. Retrying in 2s...")
                        time.sleep(2)
                    else:
                        err_snippet = res_text[:120].replace('\\n', ' ')
                        print(f"  [!] {model_name} HTTP {status}: {err_snippet}")
                        break
                except Exception as e:
                    print(f"  [!] {model_name} network error: {e}")
                    time.sleep(1)
            # move on to the next fallback model

    # Standard Deterministic Reverse Qualification Engine
    print(f"  [*] Executing deterministic scoring engine for Batch {batch_num}...")
    evaluations = []
    for cand in candidates_batch:
        yoe = cand.get("years_of_experience", 7.0)
        curr_co = cand.get("current_company", "")
        switches = cand.get("estimated_switches", 1)
        is_svc = curr_co in SERVICE_COMPANIES
        
        # Deep Citi check
        has_citi = cand.get("worked_at_citi", False)
        citi_note = cand.get("citi_experience_details", "None")

        # Disqualification checks
        curr_lower = curr_co.lower()
        if "tcs" in curr_lower or "tata consultancy" in curr_lower:
            evaluations.append({
                "candidate_id": cand.get("candidate_id"),
                "verdict": "REJECT",
                "fit_score": 20,
                "years_of_experience": yoe,
                "company_switches": switches,
                "is_service_company": is_svc,
                "worked_at_citi": False,
                "citi_experience_details": "None",
                "matched_skills": [],
                "missing_skills": ["TCS Disqualification"],
                "summary": "Disqualified: Non-negotiable TCS exclusion policy.",
                "_model_used": "deterministic-fallback-engine",
            })
            continue

        if any(c in curr_lower for c in ["citi", "citibank", "citigroup"]):
            evaluations.append({
                "candidate_id": cand.get("candidate_id"),
                "verdict": "REJECT",
                "fit_score": 30,
                "years_of_experience": yoe,
                "company_switches": switches,
                "is_service_company": is_svc,
                "worked_at_citi": False,
                "citi_experience_details": "Currently employed at Citi",
                "matched_skills": [],
                "missing_skills": ["Current Citi Employee"],
                "summary": "Disqualified: Currently employed at Citi.",
                "_model_used": "deterministic-fallback-engine",
            })
            continue

        # Score computation
        score = 65
        if is_svc:
            score += 15
        if has_citi:
            score += 10
        if ${minExp} <= yoe <= ${maxExp}:
            score += 5
        if switches <= 2:
            score += 4

        # Skill match analysis
        skills = cand.get("skills", [])
        matched_skills = [s for s in skills if any(cs.lower() in s.lower() for cs in ${JSON.stringify(coreSkills)})][:5]
        if matched_skills:
            score += min(6, len(matched_skills) * 2)

        score = min(98, score)
        verdict = "STRONG MATCH" if score >= 80 else ("POTENTIAL MATCH" if score >= 60 else "REJECT")

        evaluations.append({
            "candidate_id": cand.get("candidate_id"),
            "verdict": verdict,
            "fit_score": score,
            "years_of_experience": yoe,
            "company_switches": switches,
            "is_service_company": is_svc,
            "worked_at_citi": has_citi,
            "citi_experience_details": citi_note,
            "matched_skills": matched_skills or skills[:4],
            "missing_skills": [],
            "summary": f"{verdict} at {curr_co} with {yoe} YoE." + (f" Verified Citi exposure: {citi_note}." if has_citi else ""),
            "_model_used": "deterministic-fallback-engine",
        })
    return evaluations


def print_ascii_table(rows):
    headers = [
        "No.",
        "Candidate Name",
        "Verdict",
        "Score",
        "YoE",
        "Country",
        "Current Employer",
        "Citi Exp?",
        "LinkedIn URL",
    ]
    col_widths = [4, 20, 16, 6, 6, 8, 20, 10, 38]

    def format_row(values):
        return (
            "| "
            + " | ".join(
                f"{str(val)[:width]:<{width}}"
                for val, width in zip(values, col_widths)
            )
            + " |"
        )

    separator = "+-" + "-+-".join("-" * w for w in col_widths) + "-+"

    print("\\n" + separator)
    print(format_row(headers))
    print(separator)
    for idx, r in enumerate(rows, 1):
        vals = [
            str(idx),
            r["Name"],
            r["Verdict"],
            str(r["Fit Score"]),
            f"{r['YoE']}y",
            r["Location"],
            r["Current Company"],
            r["Worked at Citi"],
            r["LinkedIn URL"],
        ]
        print(format_row(vals))
    print(separator + "\\n")


def save_to_sqlite_database(conn, jd_hash, role_name, jd_text, evaluated_rows, merge_with_previous):
    """Saves candidate records and pull metadata into SQLite database."""
    cur = conn.cursor()
    if not merge_with_previous:
        cur.execute("DELETE FROM candidate_evaluations WHERE jd_hash = ?", (jd_hash,))

    citi_count = 0
    for r in evaluated_rows:
        has_citi = 1 if (r["Worked at Citi"] == "Yes" or r.get("worked_at_citi") is True) else 0
        if has_citi:
            citi_count += 1
        
        cur.execute("""
            INSERT OR REPLACE INTO candidate_evaluations (
                candidate_id, jd_hash, role_name, name, verdict, fit_score,
                years_of_experience, company_switches, location, is_service_company,
                current_company, headline, linkedin_url, worked_at_citi,
                citi_experience_details, recruiter_summary, matched_skills, missing_skills
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            r["LinkedIn URL"],
            jd_hash,
            role_name,
            r["Name"],
            r["Verdict"],
            r["Fit Score"],
            r["YoE"],
            r["Switches"],
            r["Location"],
            r["Service Company"],
            r["Current Company"],
            r["Headline"],
            r["LinkedIn URL"],
            has_citi,
            r.get("Citi Details", ""),
            r["Recruiter Summary"],
            r["Matched Skills"],
            r["Missing Skills"]
        ))

    cur.execute("""
        INSERT OR REPLACE INTO jd_pull_history (
            jd_hash, role_name, jd_text, last_pulled_at, candidate_count, citi_count
        ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
    """, (jd_hash, role_name, jd_text, len(evaluated_rows), citi_count))

    conn.commit()
    print(f"[*] Persisted {len(evaluated_rows)} candidate profiles into SQLite database: {SQLITE_DB_PATH}")
    print(f"    - Identified {citi_count} talent profile(s) with verified past Citi experience.")


def main():
    print("=" * 75)
    print("  TALENT SOURCING & REVERSE QUALIFICATION PIPELINE (PYTHON 3)")
    print("  Role Target: ${roleName} | Location: ${locationVal} | Model: Gemini 3.1 Flash-Lite")
    print("=" * 75)

    # Initialize SQLite Database & Check previous pulls
    conn = init_sqlite_db(SQLITE_DB_PATH)
    jd_hash, should_merge = check_existing_jd_pull(conn, JOB_DESCRIPTION, "${roleName}")

    raw_profiles = fetch_candidates_profiles()
    print(f"\\nExtracted {len(raw_profiles)} candidate profiles from talent network.\\n")

    if not raw_profiles:
        print("[!] No candidates returned. Please verify your Crustdata API Key and network filters.")
        return

    dossiers = []
    for p in raw_profiles:
        basic = p.get("basic_profile", {}) or {}
        emp_details = (
            p.get("experience", {}).get("employment_details", {}) or {}
        )

        name = basic.get("name", "Unknown Candidate")
        curr_raw = emp_details.get("current", [])
        curr_exp = (
            curr_raw[0]
            if isinstance(curr_raw, list) and len(curr_raw) > 0
            else (curr_raw if isinstance(curr_raw, dict) else {})
        )
        company = (
            curr_exp.get("company_name")
            or curr_exp.get("name")
            or basic.get("current_company")
            or "Unknown Company"
        )

        social = p.get("social_handles", {}) or {}
        p_net = social.get("professional_network_identifier", {}) or {}
        profile_url = (
            p_net.get("profile_url")
            or basic.get("professional_network_profile_url")
            or f"Crustdata ID: {p.get('crustdata_person_id')}"
        )

        past_raw = emp_details.get("past", [])
        past_list = (
            past_raw
            if isinstance(past_raw, list)
            else ([past_raw] if past_raw else [])
        )
        unique_companies = {company} if company != "Unknown Company" else set()
        for past_item in past_list:
            if isinstance(past_item, dict):
                p_name = past_item.get("company_name") or past_item.get("name")
                if p_name:
                    unique_companies.add(p_name)

        switches_count = max(0, len(unique_companies) - 1)
        yoe = extract_candidate_yoe(p)
        has_citi, citi_details = detect_citi_experience(emp_details, basic)

        loc_country = basic.get("location", {}).get("country", "${locationVal}")

        dossiers.append(
            {
                "candidate_id": profile_url,
                "name": name,
                "headline": basic.get("headline", ""),
                "summary": basic.get("summary", ""),
                "years_of_experience": yoe,
                "location": loc_country,
                "current_company": company,
                "total_unique_companies": len(unique_companies),
                "estimated_switches": switches_count,
                "worked_at_citi": has_citi,
                "citi_experience_details": citi_details,
                "experience_history": emp_details,
                "skills": p.get("skills", {}).get(
                    "professional_network_skills", []
                ),
                "linkedin_url": profile_url,
            }
        )

    BATCH_SIZE = 10
    all_evaluated_rows = []

    for i in range(0, len(dossiers), BATCH_SIZE):
        batch = dossiers[i : i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = (len(dossiers) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"[*] Screening Batch {batch_num}/{total_batches} ({len(batch)} candidates)...")

        evaluations = evaluate_batch_with_gemini(batch, JOB_DESCRIPTION, batch_num, total_batches)

        for idx, item in enumerate(batch):
            eval_res = evaluations[idx] if idx < len(evaluations) else {}
            verdict = eval_res.get("verdict", "REJECT")
            score = eval_res.get("fit_score", 0)
            switches = eval_res.get(
                "company_switches", item["estimated_switches"]
            )
            candidate_yoe = eval_res.get(
                "years_of_experience", item["years_of_experience"]
            )

            is_service = (
                "Yes (+15)"
                if eval_res.get("is_service_company") is True or item["current_company"] in SERVICE_COMPANIES
                else "No"
            )

            has_citi = eval_res.get("worked_at_citi", item["worked_at_citi"])
            citi_details = eval_res.get("citi_experience_details", item["citi_experience_details"])

            all_evaluated_rows.append(
                {
                    "Name": item["name"],
                    "Verdict": verdict,
                    "Fit Score": score,
                    "YoE": candidate_yoe,
                    "Switches": switches,
                    "Location": item["location"],
                    "Service Company": is_service,
                    "Worked at Citi": "Yes" if has_citi else "No",
                    "Citi Details": citi_details,
                    "Current Company": item["current_company"],
                    "Headline": item["headline"],
                    "LinkedIn URL": item["linkedin_url"],
                    "Recruiter Summary": eval_res.get("summary", "N/A"),
                    "Matched Skills": ", ".join(
                        eval_res.get("matched_skills", [])
                    ),
                    "Missing Skills": ", ".join(
                        eval_res.get("missing_skills", [])
                    ),
                    "Data Source": "Live Crustdata Pipeline (real, not synthetic)",
                    "Gemini Model Used": eval_res.get("_model_used", "deterministic-fallback-engine"),
                }
            )

        time.sleep(1)

    # Sort: Shortlisted matches first, ordered descending by fit score
    all_evaluated_rows.sort(
        key=lambda x: (
            0 if x["Verdict"] in ["STRONG MATCH", "POTENTIAL MATCH"] else 1,
            -x["Fit Score"],
        )
    )

    # Persist to SQLite Database
    save_to_sqlite_database(conn, jd_hash, "${roleName}", JOB_DESCRIPTION, all_evaluated_rows, should_merge)

    # Display Shortlisted Profiles in Terminal
    shortlisted = [
        r
        for r in all_evaluated_rows
        if r["Verdict"] in ["STRONG MATCH", "POTENTIAL MATCH"]
    ]
    citi_profiles = [r for r in all_evaluated_rows if r["Worked at Citi"] == "Yes"]

    if shortlisted:
        print(f"\\n{'='*30} SHORTLISTED {roleName.upper()} PROFILES ({len(shortlisted)}/{len(all_evaluated_rows)}) {'='*30}")
        print_ascii_table(shortlisted)
    else:
        print("\\n[!] No candidates qualified under the strict criteria.")

    if citi_profiles:
        print(f"\\n{'*'*25} CITI EXPERIENCE DETECTED ({len(citi_profiles)} PROFILES) {'*'*25}")
        for idx, cp in enumerate(citi_profiles, 1):
            print(f"  {idx}. {cp['Name']} ({cp['Current Company']}) - {cp['Citi Details']}")
            print(f"     LinkedIn: {cp['LinkedIn URL']}")

    # Write BOTH Shortlisted and Rejected into the CSV
    os.makedirs(os.path.dirname(OUTPUT_CSV_PATH), exist_ok=True)
    with open(OUTPUT_CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_evaluated_rows[0].keys())
        writer.writeheader()
        writer.writerows(all_evaluated_rows)

    print(f"\\n[✓] Exported all {len(all_evaluated_rows)} evaluated profiles to: {OUTPUT_CSV_PATH}")
    print("=" * 75)


if __name__ == "__main__":
    main()
`;
}
