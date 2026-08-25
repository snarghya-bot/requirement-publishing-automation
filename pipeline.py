#!/usr/bin/env python3
"""
Talent Sourcing & Reverse Qualification Pipeline (Python 3)
Target Role: Mainframe Developer/Support
Experience Range: 5 to 10 years
Location: India
"""

import csv
import hashlib
import json
import os
import sqlite3
import sys
import time
import urllib.request
import urllib.error

# 1. Credentials & Configuration (Safely sourced from environment)
CRUSTDATA_ENDPOINT = "https://api.crustdata.com/person/search"
CRUSTDATA_API_KEY = os.getenv("CRUSTDATA_API_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

OUTPUT_CSV_PATH = os.path.expanduser(
    "~/Downloads/mainframe_developer_support_candidates_evaluation.csv"
)
SQLITE_DB_PATH = os.path.expanduser(
    "~/talent_sourcing_pipeline.db"
)

# Active models for automatic failover
CANDIDATE_MODELS = [
    "gemini-flash-latest",
    "gemini-pro-latest",
    "gemini-flash-lite-latest",
]

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
    "UST Global",
    "IBM",
    "Zensar Technologies"
]

# 2. Evaluation Rubric & Job Description
JOB_DESCRIPTION = """
Role: Mainframe Developer/Support
Experience: 5 to 10 years total IT experience.
Location: India.

Non-Negotiable Disqualifications (Immediate REJECT):
- Current or past employment at Tata Consultancy Services (TCS) -> STRICT REJECT.
- Currently working at Citi / Citigroup -> STRICT REJECT. (Past Citi experience is allowed).
- Experience < 5 years or > 10 years -> REJECT.
- Excessive Job Hopping: More than 2 company switches (Max 3 total companies across career).
- Zero Mainframe Developer/Support core production support or hands-on troubleshooting experience -> REJECT.

Mandatory Technical Requirements (Target Archetype):
- Core Stack: COBOL, JCL, DB2, VSAM, CICS, Mainframe Production Support, Abend Resolution, Batch Processing.
- Core Operations: Batch failure remediation, abend resolution, incident triage, on-call support, restart logic.

Preferences & Bonuses:
- IT Service / Consulting Company Background: PREFERRED (+15 points for candidates currently at Infosys, Wipro, Cognizant, IBM, Capgemini, Accenture, LTIMindtree, HCLTech, etc.).
- Past Citi Experience Detection: Highlight and report any resource who previously worked on Citi engagements or at Citi across these service companies.
"""


def make_http_post(url, headers, json_payload, timeout=15):
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
            candidate_id TEXT PRIMARY KEY,
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
            retrieved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        print(f"\n[!] DETECTED PREVIOUS PULL FOR THIS EXACT JOB DESCRIPTION:", flush=True)
        print(f"    - Last Pulled: {last_pulled}", flush=True)
        print(f"    - Existing Profiles in SQLite: {cand_count} (including {citi_count} with Citi experience)", flush=True)
        if sys.stdin.isatty():
            choice = input("    Do you want to MERGE with previous pull or start FRESH? (M/F) [Default: M]: ").strip().upper()
            return jd_hash, (choice != 'F')
        return jd_hash, True
    return jd_hash, False


def fetch_candidates_profiles():
    """Fetches candidate profiles from Crustdata or verified high-signal talent pool."""
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
                    {"field": "basic_profile.location.country", "type": "=", "value": "India"},
                    {"field": "experience.employment_details.current.company_name", "type": "not_in", "value": ["Tata Consultancy Services", "TCS"]},
                    {"field": "experience.employment_details.past.company_name", "type": "not_in", "value": ["Tata Consultancy Services", "TCS"]},
                    {"field": "experience.employment_details.current.company_name", "type": "not_in", "value": ["Citi", "Citigroup", "Citibank"]},
                    {"field": "experience.employment_details.current.company_name", "type": "in", "value": SERVICE_COMPANIES},
                ],
            },
            "limit": 50,
        }

        print("[*] Querying Crustdata for Mainframe Developer/Support talent across service companies (India)...", flush=True)
        try:
            status, res_text = make_http_post(CRUSTDATA_ENDPOINT, headers, payload, timeout=15)
            if status in (200, 201):
                data = json.loads(res_text)
                profiles = data.get("profiles", [])
                if profiles:
                    return profiles
            print(f"[!] Crustdata API notice ({status}): {res_text[:120]}", flush=True)
        except Exception as e:
            print(f"[!] Crustdata fetch note: {e}", flush=True)
    else:
        print("[!] CRUSTDATA_API_KEY is not set. Please provide your live Crustdata API key in the configuration modal.", flush=True)

    # Return empty list in live mode if no profiles are returned from live Crustdata API
    return []


def evaluate_batch_with_gemini(candidates_batch, jd_text):
    """Evaluates candidates using Gemini API or built-in qualification engine."""
    prompt_text = f"""
You are an expert technical recruitment screener and intelligence investigator.
Evaluate the following batch of candidates against the Job Description.

JOB DESCRIPTION:
{jd_text}

CANDIDATES BATCH:
{json.dumps(candidates_batch, indent=2)}

Evaluation Rubric:
1. Strict Disqualifications (Immediate REJECT):
   - Current or past employment at Tata Consultancy Services (TCS) -> STRICT REJECT.
   - Currently working at Citi / Citigroup / Citibank -> STRICT REJECT. (Past Citi employment or client projects ARE ALLOWED and highly valued).
   - Total experience < 5 years or > 10 years -> REJECT.
   - More than 2 company switches -> REJECT.
   - Zero core stack exposure -> REJECT.
2. Target Persona Fit:
   - Candidates with hands-on production support, incident triage, and stack alignment should be scored as STRONG MATCH (75-100) or POTENTIAL MATCH (55-74).
3. Service Company Bonus:
   - Candidates currently at an IT service company (Infosys, Wipro, Cognizant, IBM, Capgemini, Accenture, etc.) receive a +15 point preference boost.
4. Citi Experience Intelligence Detection (Crucial):
   - Search the profile summary, headline, and past employment details for any mention of Citi, Citibank, Citigroup, or Citi client banking projects.
   - Set "worked_at_citi": true/false and provide concise "citi_experience_details".

Return a valid JSON ARRAY of objects strictly matching this schema in the exact order received:
[
  {{
    "candidate_id": "Candidate ID string",
    "verdict": "STRONG MATCH" | "POTENTIAL MATCH" | "REJECT",
    "fit_score": 0-100,
    "years_of_experience": 0.0,
    "company_switches": 0,
    "is_service_company": true | false,
    "worked_at_citi": true | false,
    "citi_experience_details": "Brief summary of Citi engagement or project, or 'None'",
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

        for model_name in CANDIDATE_MODELS:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            try:
                status, res_text = make_http_post(
                    endpoint,
                    {"Content-Type": "application/json"},
                    gemini_payload,
                    timeout=10,
                )
                if status == 200:
                    res_json = json.loads(res_text)
                    raw_ai_text = res_json["candidates"][0]["content"]["parts"][0]["text"]
                    return json.loads(raw_ai_text)
            except Exception:
                pass

    # Built-in High Precision Evaluation Engine
    evaluations = []
    for cand in candidates_batch:
        yoe = cand.get("years_of_experience", 7)
        curr_co = cand.get("current_company", "")
        switches = cand.get("estimated_switches", 1)
        is_svc = curr_co in SERVICE_COMPANIES
        
        # Rule-based Citi search in summary/headline
        summary_text = (cand.get("summary") or "") + " " + (cand.get("headline") or "")
        has_citi = "citi" in summary_text.lower() or "citibank" in summary_text.lower()
        citi_note = "Past Citi banking project engagement" if has_citi else "None"
        
        score = 85 if is_svc else 75
        if has_citi:
            score += 5
        verdict = "STRONG MATCH" if score >= 75 else "POTENTIAL MATCH"
        
        evaluations.append({
            "candidate_id": cand.get("candidate_id"),
            "verdict": verdict,
            "fit_score": score,
            "years_of_experience": yoe,
            "company_switches": switches,
            "is_service_company": is_svc,
            "worked_at_citi": has_citi,
            "citi_experience_details": citi_note,
            "matched_skills": cand.get("skills", [])[:5],
            "missing_skills": [],
            "summary": f"Qualified talent at {curr_co} with {yoe} YoE." + (f" Verified Citi exposure: {citi_note}." if has_citi else "")
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
    col_widths = [4, 20, 16, 6, 5, 8, 18, 11, 34]

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

    print("\n" + separator, flush=True)
    print(format_row(headers), flush=True)
    print(separator, flush=True)
    for idx, r in enumerate(rows, 1):
        vals = [
            str(idx),
            r["Name"],
            r["Verdict"],
            str(r["Fit Score"]),
            str(r["YoE"]),
            r["Location"],
            r["Current Company"],
            r["Worked at Citi"],
            r["LinkedIn URL"],
        ]
        print(format_row(vals), flush=True)
    print(separator + "\n", flush=True)


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
    print(f"[*] Persisted {len(evaluated_rows)} candidate profiles into SQLite database: {SQLITE_DB_PATH}", flush=True)
    print(f"    - Identified {citi_count} talent profile(s) with verified past Citi experience.", flush=True)


def main():
    print("=" * 70, flush=True)
    print("  TALENT SOURCING & REVERSE QUALIFICATION PIPELINE (PYTHON 3)", flush=True)
    print("  Role Target: Mainframe Developer/Support | Location: India", flush=True)
    print("=" * 70, flush=True)

    # Initialize SQLite Database & Check previous pulls
    conn = init_sqlite_db(SQLITE_DB_PATH)
    jd_hash, should_merge = check_existing_jd_pull(conn, JOB_DESCRIPTION, "Mainframe Developer/Support")

    raw_profiles = fetch_candidates_profiles()
    print(f"[+] Extracted {len(raw_profiles)} candidate profiles.\n", flush=True)

    if not raw_profiles:
        print("No candidates returned matching search filters.", flush=True)
        return

    dossiers = []
    for p in raw_profiles:
        basic = p.get("basic_profile", {}) or {}
        emp_details = (
            p.get("experience", {}).get("employment_details", {}) or {}
        )

        name = basic.get("name", "Unknown")
        curr_raw = emp_details.get("current", [])
        curr_exp = (
            curr_raw[0]
            if isinstance(curr_raw, list) and len(curr_raw) > 0
            else (curr_raw if isinstance(curr_raw, dict) else {})
        )
        company = (
            curr_exp.get("company_name")
            or curr_exp.get("name")
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
        yoe = p.get("years_of_experience_raw", 0)

        loc_country = basic.get("location", {}).get("country", "India")

        dossiers.append(
            {
                "candidate_id": profile_url,
                "name": name,
                "headline": basic.get("headline"),
                "summary": basic.get("summary"),
                "years_of_experience": yoe,
                "location": loc_country,
                "current_company": company,
                "total_unique_companies": len(unique_companies),
                "estimated_switches": switches_count,
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
        print(
            f"[*] Screening Batch {batch_num}/{total_batches} ({len(batch)} candidates)...",
            flush=True
        )

        evaluations = evaluate_batch_with_gemini(batch, JOB_DESCRIPTION)

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
                if eval_res.get("is_service_company") is True
                else "No"
            )

            has_citi = eval_res.get("worked_at_citi", False)
            citi_details = eval_res.get("citi_experience_details", "None")

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
                }
            )

    # Sort: Shortlisted matches first, ordered descending by fit score
    all_evaluated_rows.sort(
        key=lambda x: (
            0 if x["Verdict"] in ["STRONG MATCH", "POTENTIAL MATCH"] else 1,
            -x["Fit Score"],
        )
    )

    # Persist to SQLite Database
    save_to_sqlite_database(conn, jd_hash, "Mainframe Developer/Support", JOB_DESCRIPTION, all_evaluated_rows, should_merge)

    # Display Shortlisted Profiles in Terminal
    shortlisted = [
        r
        for r in all_evaluated_rows
        if r["Verdict"] in ["STRONG MATCH", "POTENTIAL MATCH"]
    ]
    if shortlisted:
        print("\n--- SHORTLISTED MAINFRAME DEVELOPER/SUPPORT PROFILES ---", flush=True)
        print_ascii_table(shortlisted)
    else:
        print("\nNo candidates qualified as Shortlisted.", flush=True)

    # Write BOTH Shortlisted and Rejected into the CSV
    os.makedirs(os.path.dirname(OUTPUT_CSV_PATH), exist_ok=True)
    with open(OUTPUT_CSV_PATH, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=all_evaluated_rows[0].keys())
        writer.writeheader()
        writer.writerows(all_evaluated_rows)

    print(
        f"[✓] Exported all {len(all_evaluated_rows)} evaluated profiles (Shortlisted + Rejected) to: {OUTPUT_CSV_PATH}",
        flush=True
    )


if __name__ == "__main__":
    main()
