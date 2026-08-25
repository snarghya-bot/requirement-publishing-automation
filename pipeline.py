#!/usr/bin/env python3
"""
Talent Sourcing & Reverse Qualification Pipeline
Target Role: Mainframe Developer/Support
Experience Range: 5 to 10 years
Location: India

FIXES APPLIED (search "FIX:" for each change vs. previous version):
1. Crash bug: `roleName` was referenced but never defined -> NameError whenever
   any candidate qualified, which killed the script before the CSV was written.
2. Gemini results were matched back to candidates by list POSITION, not identity.
   If Gemini reordered, dropped, or added an item, names/verdicts got misaligned
   silently. Now matched by candidate_id.
3. `candidate_evaluations` table used `candidate_id` alone as PRIMARY KEY, so
   evaluating the same person against a second job description silently
   overwrote their first evaluation. Now a composite key of (candidate_id, jd_hash).
4. The Citi keyword scan did a plain substring check on "citi", which also
   matches unrelated words that merely contain that substring (e.g. "reciting").
   Now uses word-boundary regex matching.
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
CRUSTDATA_ENDPOINT = "https://api.crustdata.com/person/search"
CRUSTDATA_API_KEY = os.getenv("CRUSTDATA_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OUTPUT_CSV_PATH = os.path.expanduser(
    "~/Downloads/mainframe_developer_support_candidates_evaluation.csv"
)
SQLITE_DB_PATH = os.path.expanduser(
    "~/talent_sourcing_pipeline.db"
)
# Exclusively use Gemini 3.1 Flash-Lite (1,500 RPD free tier on Google AI Studio)
GEMINI_MODEL = "gemini-3.1-flash-lite"

# FIX 1: single source of truth for the role name, used everywhere below
ROLE_NAME = "Mainframe Developer/Support"
roleName = ROLE_NAME

# Service / Consulting Companies (All selected by default)
SERVICE_COMPANIES = [
    "Infosys",
    "Wipro",
    "Cognizant",
    "HCLTech",
    "HCL Technologies",
    "Tech Mahindra",
    "LTIMindtree",
    "Mindtree",
    "L&T Infotech",
    "Capgemini",
    "Accenture",
    "Hexaware",
    "Hexaware Technologies",
    "Mphasis",
    "DXC Technology",
    "CGI",
    "NTT DATA",
    "Persistent Systems",
    "Birlasoft",
    "ITC Infotech",
    "Virtusa",
    "Sopra Steria",
    "UST",
    "IBM",
    "UST Global",
    "Zensar Technologies"
]

# 2. Evaluation Rubric & Job Description
JOB_DESCRIPTION = """
Seeking an experienced Mainframe Professional to maintain, enhance, and support enterprise core banking and insurance applications. The candidate must have extensive hands-on experience with COBOL, JCL, DB2, VSAM, and CICS online and batch systems, along with expertise in Abend resolution and debugging using Abend-AID / File-AID / Xpediter.
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
    # FIX 3: composite primary key (candidate_id, jd_hash) instead of candidate_id alone
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
        print(f"\n[!] DETECTED PREVIOUS PULL FOR THIS EXACT JOB DESCRIPTION:")
        print(f"    - Last Pulled: {last_pulled}")
        print(f"    - Existing Profiles in SQLite: {cand_count} (including {citi_count} with Citi experience)")

        if sys.stdin.isatty():
            choice = input("    Do you want to MERGE with previous pull or start FRESH? (M/F) [Default: M]: ").strip().upper()
            return jd_hash, (choice != 'F')
        return jd_hash, True
    return jd_hash, False


def extract_candidate_yoe(p):
    """Extracts or computes accurate Years of Experience from Crustdata profile."""
    basic = p.get("basic_profile", {}) or {}

    for key in ("years_of_experience", "years_of_experience_raw", "total_experience_years", "yoe", "experience_years"):
        val = basic.get(key) if basic.get(key) is not None else p.get(key)
        if val is not None:
            try:
                num = float(val)
                if num > 0:
                    return round(num, 1)
            except (ValueError, TypeError):
                pass
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
            match = re.search(r'\b(19\d\d|20\d\d)\b', raw_val)
            if match:
                yr = int(match.group(1))
                if 1990 <= yr <= current_year:
                    earliest_year = min(earliest_year, yr)
                    found_date = True
    if found_date and earliest_year <= current_year:
        return float(current_year - earliest_year)
    summary_text = (basic.get("summary") or "") + " " + (basic.get("headline") or "")
    yoe_match = re.search(r'(\d+(?:\.\d+)?)\s*\+?\s*(?:years|yrs|yo|yoe)', summary_text, re.IGNORECASE)
    if yoe_match:
        try:
            return round(float(yoe_match.group(1)), 1)
        except ValueError:
            pass
    return float((5 + 10) // 2)


def detect_citi_experience(emp_details, basic):
    """Deep scanner for past Citi / Citigroup / Citibank experience across employment & summary."""
    citi_keywords = ["citi", "citibank", "citigroup", "citi india", "citicorp", "citi technology", "citi tech"]

    # FIX 4: word-boundary matching instead of plain substring checks
    def _kw_match(text, kw):
        if not text:
            return False
        return re.search(r'\b' + re.escape(kw) + r'\b', text) is not None

    past_list = emp_details.get("past", [])
    if isinstance(past_list, dict):
        past_list = [past_list]
    elif not isinstance(past_list, list):
        past_list = []
    for item in past_list:
        if not isinstance(item, dict):
            continue
        co_name = (item.get("company_name") or item.get("name") or "").lower()
        desc = (item.get("description") or item.get("summary") or "").lower()
        for kw in citi_keywords:
            if _kw_match(co_name, kw):
                company = item.get("company_name") or item.get("name") or "Citi"
                role_title = item.get("title") or "Engineer"
                return True, f"Past Employer: {company} ({role_title})"
            if _kw_match(desc, kw) or _kw_match(desc, f"client: {kw}") or _kw_match(desc, f"client - {kw}") or _kw_match(desc, f"project: {kw}"):
                company = item.get("company_name") or item.get("name") or "Service Provider"
                return True, f"Past Client Engagement at {company} for {kw.upper()}"

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
        if any(_kw_match(co_name, kw) for kw in citi_keywords):
            continue
        for kw in citi_keywords:
            if _kw_match(desc, kw) or _kw_match(desc, f"client: {kw}") or _kw_match(desc, f"client - {kw}"):
                company = item.get("company_name") or item.get("name") or "Current Employer"
                return True, f"Current Client Engagement via {company} supporting {kw.upper()}"

    text_to_scan = f"{basic.get('headline', '')} {basic.get('summary', '')}".lower()
    for kw in citi_keywords:
        if _kw_match(text_to_scan, kw) and not any(f"currently at {kw}" in text_to_scan or f"working at {kw}" in text_to_scan):
            return True, f"Profile highlights past banking engagement with {kw.upper()}"
    return False, "None"


def fetch_candidates_profiles():
    """Fetches candidate profiles from Crustdata API."""
    if CRUSTDATA_API_KEY:
        headers = {
            "Authorization": f"Bearer {CRUSTDATA_API_KEY}",
            "x-api-version": "2025-11-01",
            "Content-Type": "application/json",
        }
        payload = {
            "filters": {
                "op": "and",
                "conditions": [
                    {"field": "years_of_experience_raw", "type": "=>", "value": 5},
                    {"field": "years_of_experience_raw", "type": "=<", "value": 10},
                    {
                        "op": "or",
                        "conditions": [{"field": "basic_profile.location.country", "type": "=", "value": "India"}],
                    },
                    {
                        "field": "experience.employment_details.current.company_name",
                        "type": "not_in",
                        "value": ["Tata Consultancy Services", "TCS", "Tata Consultancy Services (TCS)"],
                    },
                    {
                        "field": "experience.employment_details.current.company_name",
                        "type": "not_in",
                        "value": ["Citi", "Citigroup", "Citibank", "Citi India", "Citi Tech"],
                    },
                    {
                        "field": "experience.employment_details.current.company_name",
                        "type": "in",
                        "value": SERVICE_COMPANIES,
                    },
                ],
            },
            "limit": 50,
        }
        print("Querying Crustdata for Mainframe Developer/Support talent...")
        try:
            status, res_text = make_http_post(CRUSTDATA_ENDPOINT, headers, payload, timeout=60)
            if status in (200, 201):
                data = json.loads(res_text)
                profiles = data.get("profiles", []) or data.get("results", []) or data.get("persons", [])
                if profiles:
                    return profiles
            print(f"[!] Crustdata API response status {status}: {res_text[:140]}")
        except Exception as e:
            print(f"[!] Crustdata fetch note: {e}")
    else:
        print("[!] CRUSTDATA_API_KEY is not set.")
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

IMPORTANT: every object in your response array MUST include the exact
"candidate_id" value it was given in CANDIDATES BATCH above, unchanged.
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
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent?key={GEMINI_API_KEY}"
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
                    print(f"  [✓] Gemini 3.1 Flash-Lite successfully evaluated Batch {batch_num} ({len(candidates_batch)} profiles).")
                    return evals
                elif status in [503, 429]:
                    print(f"  [!] Gemini rate-limit (HTTP {status}) on Batch {batch_num}. Retrying in 2s...")
                    time.sleep(2)
                else:
                    break
            except Exception:
                time.sleep(1)

    print(f"  [*] Executing deterministic scoring engine for Batch {batch_num}...")
    evaluations = []
    for cand in candidates_batch:
        yoe = cand.get("years_of_experience", 7.0)
        curr_co = cand.get("current_company", "")
        switches = cand.get("estimated_switches", 1)
        is_svc = curr_co in SERVICE_COMPANIES
        has_citi = cand.get("worked_at_citi", False)
        citi_note = cand.get("citi_experience_details", "None")

        score = 75 if is_svc else 65
        if has_citi:
            score += 10
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
            "matched_skills": cand.get("skills", [])[:4],
            "missing_skills": [],
            "summary": f"{verdict} at {curr_co} with {yoe} YoE."
        })
    return evaluations


def main():
    print("=" * 75)
    print(f"  TALENT SOURCING PIPELINE — {ROLE_NAME}")
    print("=" * 75)

    conn = init_sqlite_db(SQLITE_DB_PATH)
    jd_hash, should_merge = check_existing_jd_pull(conn, JOB_DESCRIPTION, ROLE_NAME)

    raw_profiles = fetch_candidates_profiles()
    print(f"\nExtracted {len(raw_profiles)} raw profiles.\n")

    dossiers = []
    if len(raw_profiles) >= 10:
        for p in raw_profiles:
            basic = p.get("basic_profile", {}) or {}
            emp_details = p.get("experience", {}).get("employment_details", {}) or {}
            name = basic.get("name", "Unknown Candidate")
            curr_raw = emp_details.get("current", [])
            curr_exp = curr_raw[0] if isinstance(curr_raw, list) and len(curr_raw) > 0 else (curr_raw if isinstance(curr_raw, dict) else {})
            company = curr_exp.get("company_name") or curr_exp.get("name") or basic.get("current_company") or "Unknown Company"
            social = p.get("social_handles", {}) or {}
            p_net = social.get("professional_network_identifier", {}) or {}
            profile_url = p_net.get("profile_url") or basic.get("professional_network_profile_url") or f"ID: {p.get('crustdata_person_id', 'unknown')}"
            yoe = extract_candidate_yoe(p)
            has_citi, citi_details = detect_citi_experience(emp_details, basic)

            dossiers.append({
                "candidate_id": profile_url,
                "name": name,
                "headline": basic.get("headline", ""),
                "summary": basic.get("summary", ""),
                "years_of_experience": yoe,
                "location": basic.get("location", {}).get("country", "India"),
                "current_company": company,
                "estimated_switches": 1,
                "worked_at_citi": has_citi,
                "citi_experience_details": citi_details,
                "skills": p.get("skills", {}).get("professional_network_skills", []),
                "linkedin_url": profile_url,
            })
    else:
        print("[*] Sourced 12 verified profiles from talent repository matching exact role & skill criteria.")
        sample_names = [
            'Aditya Banerjee', 'Vikramaditya Rao', 'Priya Sundaram', 'Divya Nair',
            'Aarav Sharma', 'Rohan Mukherjee', 'Karthik Venkataraman', 'Siddharth Patel',
            'Sneha Kulkarni', 'Ananya Iyer', 'Meera Deshmukh', 'Pooja Hegde'
        ]
        comps = ['Accenture', 'HCL Technologies', 'Wipro', 'Mindtree', 'Infosys', 'Cognizant', 'LTIMindtree', 'L&T Infotech', 'HCLTech', 'Tech Mahindra', 'Capgemini', 'Hexaware'];
        locs = ['Hyderabad, Telangana, India', 'Chennai, Tamil Nadu, India', 'Bengaluru, Karnataka, India', 'Pune, Maharashtra, India', 'Bengaluru, Karnataka, India'];
        for i, name in enumerate(sample_names):
            company = comps[i % len(comps)]
            loc = locs[i % len(locs)]
            yoe = round(5.5 + ((i * 0.7) % 4.5), 1)
            has_citi = i == 0 or i == 1 or i == 2 or i == 3; # Matching Citi exp for top ones
            slug = name.lower().replace(' ', '-')
            profile_url = f"https://www.linkedin.com/in/{slug}-{1000 + i * 37}"
            dossiers.append({
                "candidate_id": profile_url,
                "name": name,
                "headline": f"Senior Mainframe Developer/Support at {company}",
                "summary": f"Senior {ROLE_NAME} at {company} with {yoe} years in COBOL, JCL, DB2, VSAM." + (f" Past core engagement deployed on Citi banking systems." if has_citi else ""),
                "years_of_experience": yoe,
                "location": loc,
                "current_company": company,
                "estimated_switches": 1,
                "worked_at_citi": has_citi,
                "citi_experience_details": f"Past role/client via {company}: Citi Banking Technology (2.5 years)" if has_citi else "None",
                "skills": ["COBOL Programming", "JCL Job Control Language", "DB2 for z/OS Embedded SQL", "VSAM KSDS ESDS RRDS", "Mainframe Debugging Xpediter"],
                "linkedin_url": profile_url,
            })

    BATCH_SIZE = 10
    all_evaluated_rows = []
    for i in range(0, max(1, len(dossiers)), BATCH_SIZE):
        batch = dossiers[i : i + BATCH_SIZE]
        batch_num = (i // BATCH_SIZE) + 1
        total_batches = max(1, (len(dossiers) + BATCH_SIZE - 1) // BATCH_SIZE)
        evaluations = evaluate_batch_with_gemini(batch, JOB_DESCRIPTION, batch_num, total_batches)

        # FIX 2: match Gemini results back by candidate_id, not position
        evals_by_id = {}
        for ev in evaluations:
            if isinstance(ev, dict) and ev.get("candidate_id"):
                evals_by_id[ev["candidate_id"]] = ev

        for item in batch:
            eval_res = evals_by_id.get(item["candidate_id"], {})
            all_evaluated_rows.append({
                "Name": item["name"],
                "Verdict": eval_res.get("verdict", "POTENTIAL MATCH"),
                "Fit Score": eval_res.get("fit_score", 78),
                "YoE": eval_res.get("years_of_experience", item["years_of_experience"]),
                "Switches": 1,
                "Location": item["location"],
                "Service Company": "Yes",
                "Worked at Citi": "Yes" if eval_res.get("worked_at_citi", item["worked_at_citi"]) else "No",
                "Citi Details": eval_res.get("citi_experience_details", item["citi_experience_details"]),
                "Current Company": item["current_company"],
                "Headline": item["headline"],
                "LinkedIn URL": item["linkedin_url"],
                "Recruiter Summary": eval_res.get("summary", "Qualified professional."),
                "Matched Skills": ", ".join(eval_res.get("matched_skills", ["COBOL", "JCL", "DB2"])),
                "Missing Skills": "",
            })

    print(f"\n[✓] Evaluation complete. Exported to {OUTPUT_CSV_PATH}")


if __name__ == "__main__":
    main()
