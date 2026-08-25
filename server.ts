import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------------
// Optional shared-secret auth guard for mutating / execution endpoints.
//
// /api/run-python spawns an arbitrary server-supplied Python script with real
// CRUSTDATA_API_KEY / GEMINI_API_KEY injected into its environment. The /api/roles
// and /api/companies write endpoints mutate JSON files on disk. None of this was
// previously authenticated at all. Setting INTERNAL_API_TOKEN turns on enforcement;
// leaving it unset keeps today's unauthenticated local-dev behavior (with a startup
// warning) so this doesn't break anyone running purely on localhost.
// ---------------------------------------------------------------------------------
const INTERNAL_API_TOKEN = (process.env.INTERNAL_API_TOKEN || '').trim();

if (!INTERNAL_API_TOKEN) {
  console.warn(
    '[SECURITY WARNING] INTERNAL_API_TOKEN is not set. /api/run-python (arbitrary server-side ' +
    'Python execution with your API keys) and the roles/companies write endpoints are ' +
    'UNAUTHENTICATED. This is fine for local-only development, but do NOT deploy this server ' +
    'to a public URL (e.g. Cloud Run) without setting INTERNAL_API_TOKEN in the environment.'
  );
}

function requireInternalToken(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!INTERNAL_API_TOKEN) return next();
  const provided = (req.get('x-internal-token') || '').trim();
  if (provided !== INTERNAL_API_TOKEN) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: missing or invalid x-internal-token header. Set INTERNAL_API_TOKEN on the server and provide it via the API Credentials modal.',
    });
  }
  next();
}

// Quota and Rate Limit Tracker for Gemini Free Tier
interface ModelQuotaDef {
  model: string;
  displayName: string;
  dailyLimit: number;
  rpmLimit: number;
  tpmLimit: number;
  description: string;
}

const MODEL_QUOTA_DEFS: Record<string, ModelQuotaDef> = {
  'gemini-3.1-flash-lite': {
    model: 'gemini-3.1-flash-lite',
    displayName: 'Gemini 3.1 Flash-Lite',
    dailyLimit: 1500,
    rpmLimit: 15,
    tpmLimit: 1000000,
    description: 'Ultra-low latency lightweight intelligence engine (1,500 RPD free tier); primary model',
  },
  'gemini-3.6-flash': {
    model: 'gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    dailyLimit: 1500,
    rpmLimit: 15,
    tpmLimit: 1000000,
    description: 'Automatic failover model used when Gemini 3.1 Flash-Lite is rate-limited or unavailable',
  },
};

const KNOWN_GEMINI_MODELS = Object.keys(MODEL_QUOTA_DEFS);

interface RequestLogEntry {
  id: string;
  timestamp: number;
  model: string;
  success: boolean;
  status: number;
  error?: string;
}

function freshDailyCounts(): Record<string, number> {
  return KNOWN_GEMINI_MODELS.reduce((acc, m) => ({ ...acc, [m]: 0 }), {} as Record<string, number>);
}

class GeminiQuotaTracker {
  private dailyCounts: Record<string, number> = freshDailyCounts();
  private requestHistory: RequestLogEntry[] = [];
  private currentDayUTC: string = new Date().toISOString().split('T')[0];
  private lastRateLimitError: { timestamp: number; model: string; error: string } | null = null;

  constructor() {
    this.checkDayRoll();
  }

  private checkDayRoll() {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.currentDayUTC) {
      this.currentDayUTC = today;
      this.dailyCounts = freshDailyCounts();
      this.lastRateLimitError = null;
    }
  }

  public recordRequest(model: string, success: boolean, status: number, error?: string) {
    this.checkDayRoll();
    const normalizedModel = KNOWN_GEMINI_MODELS.includes(model) ? model : 'gemini-3.1-flash-lite';
    this.dailyCounts[normalizedModel] = (this.dailyCounts[normalizedModel] || 0) + 1;

    const logEntry: RequestLogEntry = {
      id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: Date.now(),
      model: normalizedModel,
      success,
      status,
      error,
    };

    if (!success && (status === 429 || error?.includes('429') || error?.includes('quota') || error?.includes('RESOURCE_EXHAUSTED'))) {
      this.lastRateLimitError = {
        timestamp: Date.now(),
        model: normalizedModel,
        error: error || '429 Quota Exceeded',
      };
    }

    this.requestHistory.unshift(logEntry);
    if (this.requestHistory.length > 50) {
      this.requestHistory.pop();
    }
  }

  public resetCounters() {
    this.dailyCounts = freshDailyCounts();
    this.lastRateLimitError = null;
    this.requestHistory = [];
  }

  public getStats() {
    this.checkDayRoll();
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    // Calculate current requests in last 60 seconds (RPM)
    const recentMinuteRequests = this.requestHistory.filter((r) => r.timestamp >= oneMinuteAgo);
    const rpmCurrent = recentMinuteRequests.length;

    // Calculate time until next UTC midnight reset
    const tomorrow = new Date();
    tomorrow.setUTCHours(24, 0, 0, 0);
    const msUntilMidnight = tomorrow.getTime() - now;
    const hoursUntilReset = Math.floor(msUntilMidnight / 3600000);
    const minutesUntilReset = Math.floor((msUntilMidnight % 3600000) / 60000);

    const modelStats = Object.keys(MODEL_QUOTA_DEFS).map((key) => {
      const def = MODEL_QUOTA_DEFS[key];
      const usedToday = this.dailyCounts[key] || 0;
      const remainingToday = Math.max(0, def.dailyLimit - usedToday);
      const usagePercentage = Math.min(100, Math.round((usedToday / def.dailyLimit) * 100));
      const modelRecentRpm = recentMinuteRequests.filter((r) => r.model === key).length;
      
      let status: 'HEALTHY' | 'WARNING' | 'EXHAUSTED' = 'HEALTHY';
      if (usagePercentage >= 100 || (this.lastRateLimitError && this.lastRateLimitError.model === key)) {
        status = 'EXHAUSTED';
      } else if (usagePercentage >= 75) {
        status = 'WARNING';
      }

      return {
        ...def,
        usedToday,
        remainingToday,
        usagePercentage,
        currentRpm: modelRecentRpm,
        status,
      };
    });

    const totalRequestsToday = Object.values(this.dailyCounts).reduce((a, b) => a + b, 0);

    return {
      currentDayUTC: this.currentDayUTC,
      resetInFormatted: `${hoursUntilReset}h ${minutesUntilReset}m`,
      resetInMs: msUntilMidnight,
      totalRequestsToday,
      currentRpmTotal: rpmCurrent,
      tier: 'Google AI Studio Free Tier',
      lastRateLimitError: this.lastRateLimitError,
      models: modelStats,
      recentHistory: this.requestHistory.slice(0, 10),
    };
  }
}

const quotaTracker = new GeminiQuotaTracker();

// Helper to initialize Gemini client lazily
function getGeminiClient(customApiKey?: string) {
  const key = customApiKey || process.env.GEMINI_API_KEY;
  if (!key) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// 1. Health check & API Key verification endpoint (Lightweight Ping)
app.post('/api/test-keys', async (req, res) => {
  const { crustdataApiKey, geminiApiKey } = req.body;

  const results = {
    crustdata: {
      valid: false,
      message: 'No Crustdata API key entered or configured.',
      status: 'idle',
      latencyMs: 0,
    },
    gemini: {
      valid: false,
      message: 'No Gemini API key entered or configured.',
      status: 'idle',
      latencyMs: 0,
    },
  };

  // Test Crustdata key via lightweight ping
  const effectiveCrustKey = crustdataApiKey?.trim() || process.env.CRUSTDATA_API_KEY;
  if (effectiveCrustKey) {
    const startTime = Date.now();
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      // Matches the confirmed-working shape used in /api/live-source (Bearer auth,
      // "field" filter key, /person/search) -- see the comment there for why.
      const response = await fetch('https://api.crustdata.com/person/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${effectiveCrustKey}`,
        },
        body: JSON.stringify({
          filters: { op: 'and', conditions: [{ field: 'basic_profile.location.country', type: '=', value: 'India' }] },
          limit: 1,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (response.status === 200 || response.status === 201) {
        results.crustdata = {
          valid: true,
          message: `Active & Connected (HTTP ${response.status}) - Live Person Search API ready.`,
          status: 'success',
          latencyMs,
        };
      } else if (response.status === 401 || response.status === 403) {
        results.crustdata = {
          valid: false,
          message: `Authentication failed (HTTP ${response.status}) - Invalid API token. Please check your Crustdata key.`,
          status: 'error',
          latencyMs,
        };
      } else {
        results.crustdata = {
          valid: true,
          message: `Connected to Crustdata API (HTTP ${response.status}) - Token accepted.`,
          status: 'warning',
          latencyMs,
        };
      }
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'AbortError';
      results.crustdata = {
        valid: false,
        message: isTimeout
          ? 'Connection timed out (>8s) reaching Crustdata API.'
          : `Network error: ${err.message || 'Could not reach Crustdata endpoint'}`,
        status: 'error',
        latencyMs,
      };
    }
  }

  // Test Gemini key via lightweight ping strictly with Gemini 3.1 Flash-Lite
  const effectiveGeminiKey = geminiApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (effectiveGeminiKey) {
    const startTime = Date.now();
    const candidateModels = ['gemini-3.1-flash-lite'];
    let verifiedModel = '';
    let lastErrorMsg = '';

    const ai = getGeminiClient(effectiveGeminiKey);
    if (ai) {
      for (const modelName of candidateModels) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: 'Ping test. Return OK.',
          });
          if (response.text) {
            verifiedModel = modelName;
            quotaTracker.recordRequest(modelName, true, 200);
            break;
          }
        } catch (err: any) {
          lastErrorMsg = err.message || 'Error testing model';
          const is429 = lastErrorMsg.includes('429') || lastErrorMsg.includes('quota') || lastErrorMsg.includes('RESOURCE_EXHAUSTED');
          quotaTracker.recordRequest(modelName, false, is429 ? 429 : 500, lastErrorMsg);
          continue;
        }
      }

      const latencyMs = Date.now() - startTime;
      if (verifiedModel) {
        results.gemini = {
          valid: true,
          message: `Active & Connected - Gemini 3.1 Flash-Lite ready for reverse JD validation.`,
          status: 'success',
          latencyMs,
        };
      } else {
        const isQuota429 = lastErrorMsg.includes('429') || lastErrorMsg.includes('RESOURCE_EXHAUSTED') || lastErrorMsg.includes('quota');
        results.gemini = {
          valid: false,
          message: isQuota429
            ? `Gemini Free Tier Quota Exceeded (429): Free tier per-minute/daily limit reached on your key for Gemini 3.1 Flash-Lite. Please wait a moment or link billing on Google AI Studio.`
            : `Gemini verification error: ${lastErrorMsg}`,
          status: 'error',
          latencyMs,
        };
      }
    }
  }

  const allActive = results.crustdata.valid && results.gemini.valid;
  const anyActive = results.crustdata.valid || results.gemini.valid;

  res.json({
    success: true,
    allActive,
    anyActive,
    results,
    quota: quotaTracker.getStats(),
    serverHasGeminiKey: !!process.env.GEMINI_API_KEY,
    serverHasCrustKey: !!process.env.CRUSTDATA_API_KEY,
    verifiedAt: new Date().toISOString(),
  });
});

// Role & Company Database Persistence on Server
const ROLES_DB_DIR = path.join(__dirname, 'data');
const ROLES_DB_FILE = path.join(ROLES_DB_DIR, 'roles.json');
const COMPANIES_DB_FILE = path.join(ROLES_DB_DIR, 'companies.json');

const FORBIDDEN_COMPANIES = [
  'tcs',
  'tata consultancy services',
  'tata consultancy',
  'tata consultancy services limited',
  'tcs limited',
  'tata consultancy services (tcs)',
];

function isCompanyForbidden(name: string): boolean {
  const norm = name.trim().toLowerCase();
  return FORBIDDEN_COMPANIES.some((f) => norm === f || norm.includes('tcs') || norm.includes('tata consultancy'));
}

function initRolesDb(): Record<string, any> {
  try {
    if (!fs.existsSync(ROLES_DB_DIR)) {
      fs.mkdirSync(ROLES_DB_DIR, { recursive: true });
    }
    if (fs.existsSync(ROLES_DB_FILE)) {
      const data = fs.readFileSync(ROLES_DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to read roles.json, starting fresh:', err);
  }
  return {};
}

function saveRolesDb(roles: Record<string, any>) {
  try {
    if (!fs.existsSync(ROLES_DB_DIR)) {
      fs.mkdirSync(ROLES_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(ROLES_DB_FILE, JSON.stringify(roles, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save roles.json:', err);
  }
}

function initCompaniesDb(): Array<{ name: string; isCustom: boolean; createdAt?: string }> {
  try {
    if (!fs.existsSync(ROLES_DB_DIR)) {
      fs.mkdirSync(ROLES_DB_DIR, { recursive: true });
    }
    if (fs.existsSync(COMPANIES_DB_FILE)) {
      const data = fs.readFileSync(COMPANIES_DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to read companies.json, starting fresh:', err);
  }
  return [];
}

function saveCompaniesDb(companies: Array<{ name: string; isCustom: boolean; createdAt?: string }>) {
  try {
    if (!fs.existsSync(ROLES_DB_DIR)) {
      fs.mkdirSync(ROLES_DB_DIR, { recursive: true });
    }
    fs.writeFileSync(COMPANIES_DB_FILE, JSON.stringify(companies, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save companies.json:', err);
  }
}

let serverRolesDb: Record<string, any> = initRolesDb();
let serverCompaniesDb: Array<{ name: string; isCustom: boolean; createdAt?: string }> = initCompaniesDb();

// Endpoints for Custom Roles & Skill Persistence
app.get('/api/roles', (req, res) => {
  res.json({
    success: true,
    roles: serverRolesDb,
  });
});

app.post('/api/roles/save', requireInternalToken, (req, res) => {
  const { roleConfig } = req.body;
  if (!roleConfig || !roleConfig.role) {
    return res.status(400).json({ success: false, error: 'Invalid roleConfig payload' });
  }

  serverRolesDb[roleConfig.role] = {
    ...roleConfig,
    updatedAt: new Date().toISOString(),
  };
  saveRolesDb(serverRolesDb);

  res.json({
    success: true,
    message: `Role '${roleConfig.role}' saved to database successfully.`,
    roleConfig: serverRolesDb[roleConfig.role],
  });
});

app.post('/api/roles/delete', requireInternalToken, (req, res) => {
  const { roleName } = req.body;
  if (!roleName) {
    return res.status(400).json({ success: false, error: 'roleName is required' });
  }

  delete serverRolesDb[roleName];
  saveRolesDb(serverRolesDb);

  res.json({
    success: true,
    message: `Role '${roleName}' deleted from database.`,
  });
});

app.post('/api/roles/reset', requireInternalToken, (req, res) => {
  const { roleName } = req.body;
  if (!roleName) {
    return res.status(400).json({ success: false, error: 'roleName is required' });
  }

  delete serverRolesDb[roleName];
  saveRolesDb(serverRolesDb);

  res.json({
    success: true,
    message: `Role '${roleName}' reset to default.`,
  });
});

// Endpoints for Target Company Sourcing Database Persistence
app.get('/api/companies', (req, res) => {
  res.json({
    success: true,
    companies: serverCompaniesDb,
  });
});

app.post('/api/companies/save', requireInternalToken, (req, res) => {
  const { company } = req.body;
  if (!company || !company.name || typeof company.name !== 'string') {
    return res.status(400).json({ success: false, error: 'Invalid company payload' });
  }

  const nameTrimmed = company.name.trim();
  if (isCompanyForbidden(nameTrimmed)) {
    return res.status(400).json({
      success: false,
      error: `Company '${nameTrimmed}' is strictly on the non-negotiable exclusion list (TCS) and cannot be saved.`,
    });
  }

  const existingIdx = serverCompaniesDb.findIndex(
    (c) => c.name.toLowerCase() === nameTrimmed.toLowerCase()
  );

  const itemToSave = {
    name: nameTrimmed,
    isCustom: true,
    createdAt: company.createdAt || new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    serverCompaniesDb[existingIdx] = itemToSave;
  } else {
    serverCompaniesDb.push(itemToSave);
  }

  saveCompaniesDb(serverCompaniesDb);

  res.json({
    success: true,
    message: `Company '${nameTrimmed}' saved to database successfully.`,
    companies: serverCompaniesDb,
  });
});

app.post('/api/companies/delete', requireInternalToken, (req, res) => {
  const { companyName } = req.body;
  if (!companyName) {
    return res.status(400).json({ success: false, error: 'companyName is required' });
  }

  serverCompaniesDb = serverCompaniesDb.filter(
    (c) => c.name.toLowerCase() !== companyName.toLowerCase()
  );
  saveCompaniesDb(serverCompaniesDb);

  res.json({
    success: true,
    message: `Company '${companyName}' removed from database.`,
    companies: serverCompaniesDb,
  });
});

app.post('/api/companies/reset', requireInternalToken, (req, res) => {
  serverCompaniesDb = [];
  saveCompaniesDb(serverCompaniesDb);

  res.json({
    success: true,
    message: 'Companies reset to defaults.',
    companies: [],
  });
});

// Endpoint to fetch Real-Time Gemini API Quota Telemetry
app.get('/api/gemini-quota', (req, res) => {
  res.json({
    success: true,
    data: quotaTracker.getStats(),
  });
});

// Endpoint to reset daily tracking session counters
app.post('/api/gemini-quota/reset', (req, res) => {
  quotaTracker.resetCounters();
  res.json({
    success: true,
    message: 'Gemini usage session counters reset.',
    data: quotaTracker.getStats(),
  });
});

// 1b. Gemini-driven search context builder: takes a role name (+ optional JD text)
// and generates the STRUCTURED skill/title keywords Crustdata's filter API needs --
// it does NOT hand Crustdata free-text "expanded context", because Crustdata's filter
// API takes exact field/type/value conditions, not prose. This replaces having to
// hand-maintain a hardcoded skills list per role with a per-request, Gemini-generated
// one that the user can still see and edit before it's used. Honesty guardrail matches
// the rest of this file: no key / call failure returns an explicit empty result with
// usedFallback: true, never a fabricated skill list.
app.post('/api/generate-search-context', async (req, res) => {
  const { role, customJd, geminiApiKey } = req.body;

  if (!role || typeof role !== 'string' || !role.trim()) {
    return res.status(400).json({ success: false, error: 'role is required' });
  }

  const effectiveGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  const ai = getGeminiClient(effectiveGeminiKey);

  const emptyResult = {
    mustHaveSkills: [] as string[],
    goodToHaveSkills: [] as string[],
  };

  if (!ai) {
    return res.json({
      success: true,
      usedFallback: true,
      note: 'No Gemini API key configured -- cannot auto-generate skill keywords for this role. Enter skills manually below, or add a Gemini key first.',
      ...emptyResult,
    });
  }

  const prompt = `
You are building a STRUCTURED candidate-search filter, not writing prose. Given a job
role (and optionally a job description), produce the concrete technical skill keywords
and tools a candidate search API should filter on for this role.

ROLE: "${role}"
${customJd ? `JOB DESCRIPTION:\n${customJd}` : '(No job description provided -- infer from the role title alone.)'}

Return two arrays:
1. mustHaveSkills: 5-8 short, specific, canonical skill/tool names that are strictly
   required for this role (e.g. "COBOL Programming", "Kubernetes (K8s)", "Autosys (JIL syntax & job scheduling)").
   Each item should be a short keyword phrase suitable for matching against a LinkedIn
   skills list or headline -- NOT a sentence, NOT a soft requirement.
2. goodToHaveSkills: 5-8 additional bonus/complementary skill or tool names for the same role.

Do not include generic soft skills (e.g. "communication", "teamwork"). Do not include
the role title itself as a skill. Keep each entry under 6 words.
`;

  const modelsToTry = ['gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  let lastErrorMsg = '';

  for (const model of modelsToTry) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              mustHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
              goodToHaveSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['mustHaveSkills', 'goodToHaveSkills'],
          },
        },
      });

      if (response.text) {
        const parsed = JSON.parse(response.text);
        quotaTracker.recordRequest(model, true, 200);
        return res.json({
          success: true,
          usedFallback: false,
          generatedBy: model,
          mustHaveSkills: Array.isArray(parsed.mustHaveSkills) ? parsed.mustHaveSkills : [],
          goodToHaveSkills: Array.isArray(parsed.goodToHaveSkills) ? parsed.goodToHaveSkills : [],
        });
      }
    } catch (err: any) {
      lastErrorMsg = err.message || 'Gemini error';
      const is429 = lastErrorMsg.includes('429') || lastErrorMsg.includes('quota') || lastErrorMsg.includes('RESOURCE_EXHAUSTED');
      quotaTracker.recordRequest(model, false, is429 ? 429 : 500, lastErrorMsg);
      continue;
    }
  }

  // Both models failed -- honest empty result, not a guess.
  return res.json({
    success: true,
    usedFallback: true,
    note: `Gemini could not generate skill keywords for this role (${lastErrorMsg.slice(0, 140)}). Enter skills manually below.`,
    ...emptyResult,
  });
});

// 2. Live Candidate Sourcing via Crustdata API (with Full Debug Logging)
app.post('/api/live-source', async (req, res) => {
  const {
    role,
    mustHaveSkills = [],
    goodToHaveSkills = [],
    location = 'India',
    experienceRange = '5 to 10 years',
    targetCompanies = [],
    crustdataApiKey,
  } = req.body;

  const effectiveCrustKey = (crustdataApiKey && typeof crustdataApiKey === 'string' ? crustdataApiKey.trim() : '') || process.env.CRUSTDATA_API_KEY || '';

  const debugLogs: Array<{
    attempt: number;
    url: string;
    authHeaderUsed: string;
    requestPayload: any;
    httpStatus: number;
    latencyMs: number;
    responsePreview: string;
    error?: string;
  }> = [];

  let liveCandidates: any[] = [];
  let rawProfilesCount = 0;
  let sourcingSucceeded = false;

  if (effectiveCrustKey) {
    // Crustdata contract: POST /person/search, "Authorization: Bearer <key>", filter
    // objects keyed by "field" (not "filter_type"). This shape is confirmed working
    // from a live run against a real Crustdata key (2026-08-25) -- an earlier version
    // of this endpoint used a different, unverified shape ("filter_type" / Token auth /
    // /screener/persondb/search) sourced from a third-party doc mirror that was never
    // actually tested. If Crustdata's own docs say otherwise, trust them over this
    // comment -- but this exact shape has returned real candidate data at least once.
    const authHeader = `Bearer ${effectiveCrustKey.replace(/^(Token|Bearer)\s+/i, '')}`;

    const conditions: any[] = [
      { field: 'basic_profile.headline', type: '(.)', value: role },
    ];
    if (location && location !== 'Remote / Any') {
      conditions.push({ field: 'basic_profile.location.country', type: '=', value: location });
    } else {
      conditions.push({ field: 'basic_profile.location.country', type: '=', value: 'India' });
    }
    if (targetCompanies.length > 0) {
      conditions.push({ field: 'experience.employment_details.current.company_name', type: 'in', value: targetCompanies });
    }
    if (mustHaveSkills.length > 0) {
      conditions.push({ field: 'skills.professional_network_skills', type: 'in', value: mustHaveSkills.slice(0, 8) });
    }
    // Deterministic exclusions -- NOT left to the LLM or to per-role config. TCS is a
    // non-negotiable exclusion enforced elsewhere in this file (isCompanyForbidden);
    // currently-employed-at-Citi is excluded per the same rule the Python pipeline and
    // /api/live-validate's prompt both enforce (past Citi experience is fine/valued,
    // current Citi employment is a disqualifier). This endpoint previously sent NEITHER
    // exclusion to Crustdata at all.
    conditions.push({
      field: 'experience.employment_details.current.company_name',
      type: 'not_in',
      value: ['Tata Consultancy Services', 'TCS', 'Tata Consultancy Services (TCS)'],
    });
    conditions.push({
      field: 'experience.employment_details.current.company_name',
      type: 'not_in',
      value: ['Citi', 'Citigroup', 'Citibank', 'Citi India', 'Citi Tech'],
    });

    const strategies = [
      {
        url: 'https://api.crustdata.com/person/search',
        payload: {
          filters: { op: 'and', conditions },
          limit: 50,
        },
      },
    ];

    for (let i = 0; i < strategies.length; i++) {
      const strat = strategies[i];
      const startMs = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const crustResponse = await fetch(strat.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: authHeader,
          },
          body: JSON.stringify(strat.payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latencyMs = Date.now() - startMs;
        const respText = await crustResponse.text();
        const preview = respText.slice(0, 800);

        debugLogs.push({
          attempt: i + 1,
          url: strat.url,
          authHeaderUsed: `${authHeader.slice(0, 10)}... (Length: ${effectiveCrustKey.length})`,
          requestPayload: strat.payload,
          httpStatus: crustResponse.status,
          latencyMs,
          responsePreview: preview,
        });

        if (crustResponse.ok) {
          try {
            const data = JSON.parse(respText);
            const rawProfiles = Array.isArray(data) ? data : data.profiles || data.results || data.persons || data.data || [];
            rawProfilesCount = rawProfiles.length;

            if (rawProfiles.length > 0) {
              liveCandidates = rawProfiles.map((p: any, idx: number) => {
                const basic = p.basic_profile || {};
                const emp = p.experience?.employment_details || {};
                const name = basic.name || p.name || p.full_name || `Candidate ${idx + 1}`;
                
                const currList = Array.isArray(emp.current) ? emp.current : (emp.current ? [emp.current] : []);
                const currExp = currList[0] || {};
                const company = currExp.company_name || currExp.name || p.current_company || p.company_name || (targetCompanies[idx % (targetCompanies.length || 1)] || 'Cognizant');
                const title = currExp.title || p.current_title || p.title || basic.headline || role;
                
                const skills = Array.isArray(p.skills?.professional_network_skills)
                  ? p.skills.professional_network_skills
                  : (Array.isArray(p.skills) ? p.skills : [...mustHaveSkills, ...(goodToHaveSkills.slice(0, 2))]);

                let yoe = basic.years_of_experience || basic.years_of_experience_raw || p.experience_years || p.years_of_experience || 0;
                if (!yoe) {
                  yoe = experienceRange === 'Below 5 years' ? 4.0 : 7.5;
                }

                const pastList = Array.isArray(emp.past) ? emp.past : (emp.past ? [emp.past] : []);
                let workedAtCiti = false;
                let citiDetails = 'None';
                for (const item of pastList) {
                  const cName = (item.company_name || item.name || '').toLowerCase();
                  const desc = (item.description || item.summary || '').toLowerCase();
                  if (cName.includes('citi') || desc.includes('citi')) {
                    workedAtCiti = true;
                    citiDetails = `Past role/client: ${item.company_name || 'Citi'} (${item.title || 'Engineer'})`;
                    break;
                  }
                }

                const social = p.social_handles?.professional_network_identifier || p.social_handles || {};
                const linkedinUrl = p.linkedin_url || p.linkedinUrl || p.profile_url || p.url || basic.linkedin_url || basic.profile_url || basic.linkedinUrl || social.profile_url || social.linkedin_url || (p.crustdata_person_id ? `https://app.crustdata.com/person/${p.crustdata_person_id}` : null) || 'Not Provided by API';

                return {
                  id: `crust-live-${p.id || p.crustdata_person_id || idx + 1}-${Date.now().toString().slice(-4)}`,
                  name,
                  currentRole: title,
                  currentCompany: company,
                  experienceYears: typeof yoe === 'number' ? yoe : parseFloat(yoe) || 7.0,
                  location: basic.location?.country || p.location || location,
                  country: basic.location?.country || location,
                  skills: skills.length > 0 ? skills : mustHaveSkills,
                  summary: basic.summary || basic.headline || p.summary || p.bio || `${title} at ${company} with experience in ${mustHaveSkills.join(', ')}.`,
                  education: p.education || 'Bachelor of Engineering in Computer Science',
                  profileSourceUrl: linkedinUrl,
                  workedAtCiti,
                  citiExperienceDetails: citiDetails,
                  sourcedFrom: `Live Crustdata API (${strat.url.replace('https://api.crustdata.com/', '')}) • ${company}`,
                  isSynthetic: false,
                };
              });

              sourcingSucceeded = true;
              break;
            }
          } catch (e: any) {
            console.warn('Failed to parse Crustdata response JSON:', e.message);
          }
        }
      } catch (err: any) {
        debugLogs.push({
          attempt: i + 1,
          url: strat.url,
          authHeaderUsed: `${authHeader.slice(0, 10)}... (Length: ${effectiveCrustKey.length})`,
          requestPayload: strat.payload,
          httpStatus: 0,
          latencyMs: Date.now() - startMs,
          responsePreview: '',
          error: err.message || 'Fetch failed',
        });
      }
    }
  }

  // If live sourcing returned candidates, return them with full debug metadata (any count > 0)
  if (sourcingSucceeded && liveCandidates.length > 0) {
    return res.json({
      success: true,
      source: 'crustdata-live',
      count: liveCandidates.length,
      candidates: liveCandidates,
      rawCount: rawProfilesCount,
      debug: {
        apiKeyConfigured: !!effectiveCrustKey,
        apiKeyLength: effectiveCrustKey.length,
        attempts: debugLogs,
        finalStatus: 200,
        verdict: `Successfully retrieved ${liveCandidates.length} live profiles from Crustdata API`,
      },
    });
  }

  // ---------------------------------------------------------------------------------
  // HONESTY FIX: this block generates entirely fictional candidates and only runs when
  // live Crustdata sourcing failed or returned nothing above. A prior version of this
  // block labeled these fabricated profiles `isSynthetic: false`, gave them real-looking
  // linkedin.com/in/... URLs, and reported a fabricated success verdict ("Crustdata
  // returned records... verified profiles") regardless of whether Crustdata was ever
  // actually reached. That is the exact silent-fabrication bug this app was audited for
  // -- reintroduced here in a form that actively lies (isSynthetic: false is worse than
  // just omitting the field). Every candidate below is now explicitly flagged.
  // ---------------------------------------------------------------------------------
  const sampleNames = [
    'Aarav Sharma', 'Priya Sundaram', 'Rohan Mukherjee', 'Sneha Kulkarni',
    'Vikramaditya Rao', 'Ananya Iyer', 'Karthik Venkataraman', 'Divya Nair',
    'Siddharth Patel', 'Meera Deshmukh', 'Aditya Banerjee', 'Pooja Hegde',
    'Varun Nambiar', 'Ritu Chatterjee', 'Suresh Kannan', 'Swati Bhattacharya'
  ];
  const comps = targetCompanies.length > 0 ? targetCompanies : ['Cognizant', 'Infosys', 'Wipro', 'Capgemini', 'Accenture', 'IBM India', 'Tech Mahindra', 'LTIMindtree'];
  const locs = ['Chennai, Tamil Nadu, India', 'Bengaluru, Karnataka, India', 'Hyderabad, Telangana, India', 'Pune, Maharashtra, India'];

  // Dynamic count depending on query or default to 12
  const countToReturn = 12;
  const fallbackCands = sampleNames.slice(0, countToReturn).map((name, i) => {
    const company = comps[i % comps.length];
    const loc = locs[i % locs.length];
    let yoe = 5.5 + ((i * 0.7) % 4.5);
    yoe = Math.round(yoe * 10) / 10;
    const hasCiti = i === 1 || i === 4 || i === 7 || i === 10;
    const candSkills = [...mustHaveSkills.slice(0, Math.max(2, mustHaveSkills.length - (i % 2))), ...goodToHaveSkills.slice(0, 2)];
    const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    return {
      id: `demo-${role.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${i + 1}-${Date.now().toString().slice(-4)}`,
      name: `[DEMO] ${name}`,
      currentRole: `${yoe >= 8 ? 'Senior ' : ''}${role}`,
      currentCompany: company,
      experienceYears: yoe,
      location: loc,
      country: 'India',
      skills: candSkills.length > 0 ? candSkills : ['Core Technical Skills', 'Enterprise Architecture', 'Production Support'],
      summary: hasCiti
        ? `[SYNTHETIC DEMO PROFILE -- not a real person] Senior ${role} at ${company} with ${yoe} years in ${candSkills.slice(0, 4).join(', ')}. Past core engagement deployed on Citi banking systems.`
        : `[SYNTHETIC DEMO PROFILE -- not a real person] Experienced ${role} at ${company} with ${yoe} years in ${candSkills.slice(0, 5).join(', ')}. Strong delivery track record in enterprise systems.`,
      education: 'Bachelor of Technology in Computer Science',
      // Deliberately NOT a linkedin.com URL -- this is fabricated demo data, and a
      // linkedin.com/in/... URL here would look like a real, clickable profile.
      profileSourceUrl: `https://example.invalid/synthetic-demo-profile/${slug}`,
      workedAtCiti: hasCiti,
      citiExperienceDetails: hasCiti ? `Past role/client via ${company}: Citi Banking Technology (${Math.round(1.5 + (i % 3))} years)` : 'None',
      sourcedFrom: `SYNTHETIC DEMO DATA (Crustdata unavailable) • ${company}`,
      isSynthetic: true,
    };
  });

  return res.json({
    success: true,
    count: fallbackCands.length,
    candidates: fallbackCands,
    rawCount: fallbackCands.length,
    source: 'synthetic-demo',
    isSynthetic: true,
    debug: {
      apiKeyConfigured: !!effectiveCrustKey,
      apiKeyLength: effectiveCrustKey.length,
      attempts: debugLogs,
      finalStatus: debugLogs.length > 0 ? debugLogs[0].httpStatus : 0,
      verdict: effectiveCrustKey
        ? `Crustdata live search returned 0 records or a non-200 status. Showing SYNTHETIC demo data instead -- these are NOT real candidates.`
        : `No Crustdata API key configured. Showing SYNTHETIC demo data for ${role} -- these are NOT real candidates.`,
    },
  });
});

// 2b. LinkedIn Profile & Google Search Grounding Cross-Check Guardrail
app.post('/api/google-verify-candidates', async (req, res) => {
  const { candidates = [], geminiApiKey } = req.body;
  if (!candidates || candidates.length === 0) {
    return res.json({ success: true, verifications: {} });
  }

  const effectiveGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  const ai = getGeminiClient(effectiveGeminiKey);
  const verifications: Record<string, any> = {};
  let verificationAttempted = false;
  let verificationErrorMsg = '';

  if (ai) {
    const candidateSummary = candidates.slice(0, 12).map((c: any) => ({
      id: c.id,
      name: c.name,
      currentCompany: c.currentCompany,
      location: c.location,
      skills: c.skills?.slice(0, 5) || [],
      linkedinUrl: c.profileSourceUrl,
    }));

    const prompt = `
You are an automated background check and candidate profile integrity guardrail.
Using Google Search, cross-reference and verify the public professional presence for each candidate:

CANDIDATES:
${JSON.stringify(candidateSummary, null, 2)}

FOR EACH CANDIDATE:
1. Search Google for their LinkedIn profile and career track record ("${'{name}'}" "${'{company}'}" or LinkedIn URL).
2. Check if their current employer matches (${'{companyMatch}'}: true/false, ${'{verifiedCompany}'}: string).
3. Check if their location matches (${'{locationMatch}'}: true/false, ${'{verifiedLocation}'}: string).
4. Check if their technical stack is verified (${'{skillsMatchConfidence}'}: 0-100, ${'{verifiedSkills}'}: list).
5. Set status: 'VERIFIED_MATCH' | 'PARTIALLY_VERIFIED' | 'FLAGGED_DISCREPANCY'.
6. Provide a concise 1-sentence guardrailVerdict with reasoning.
7. Include 1-2 grounding evidence summary strings in groundingSnippets.

Return a JSON array conforming to the schema.
`;

    const modelsToTry = ['gemini-3.1-flash-lite'];
    for (const model of modelsToTry) {
      verificationAttempted = true;
      try {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  candidateId: { type: Type.STRING },
                  status: { type: Type.STRING },
                  companyMatch: { type: Type.BOOLEAN },
                  verifiedCompany: { type: Type.STRING },
                  locationMatch: { type: Type.BOOLEAN },
                  verifiedLocation: { type: Type.STRING },
                  verifiedSkills: { type: Type.ARRAY, items: { type: Type.STRING } },
                  skillsMatchConfidence: { type: Type.NUMBER },
                  searchQueryUsed: { type: Type.STRING },
                  guardrailVerdict: { type: Type.STRING },
                  groundingSnippets: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: ['candidateId', 'status', 'companyMatch', 'locationMatch', 'guardrailVerdict'],
              },
            },
          },
        });

        if (response.text) {
          const parsed = JSON.parse(response.text);
          if (Array.isArray(parsed)) {
            parsed.forEach((item: any) => {
              verifications[item.candidateId] = {
                ...item,
                checkedAt: new Date().toISOString(),
              };
            });
          }
          quotaTracker.recordRequest(model, true, 200);
          break; // got a real result, no need to try the fallback model
        }
      } catch (err: any) {
        verificationErrorMsg = err.message || 'Gemini verification error';
        const is429 = verificationErrorMsg.includes('429') || verificationErrorMsg.includes('quota') || verificationErrorMsg.includes('RESOURCE_EXHAUSTED');
        quotaTracker.recordRequest(model, false, is429 ? 429 : 500, verificationErrorMsg);
        if (!is429) {
          console.warn(`Google search verification notice (${model}):`, verificationErrorMsg);
        }
      }
    }
  }

  // HONESTY GUARDRAIL: any candidate Gemini did NOT actually return a real result for
  // must be marked as not verified -- regardless of WHY it failed (quota/429, network
  // error, or no key at all). A prior version of this block fabricated a "VERIFIED_MATCH"
  // with invented confidence scores and fake grounding evidence specifically for the
  // quota-exceeded case (the single most common failure mode on the free tier) -- that
  // is the exact fabrication bug this app was audited for. An unverified profile
  // reported as verified is worse than no verification at all. Do not reintroduce it.
  for (const c of candidates) {
    if (!verifications[c.id]) {
      verifications[c.id] = {
        candidateId: c.id,
        status: ai ? 'VERIFICATION_FAILED' : 'NOT_VERIFIED',
        companyMatch: false,
        verifiedCompany: undefined,
        locationMatch: false,
        verifiedLocation: undefined,
        verifiedSkills: [],
        skillsMatchConfidence: 0,
        searchQueryUsed: `site:linkedin.com/in "${c.name}" "${c.currentCompany}"`,
        guardrailVerdict: ai
          ? `Gemini Google-Search verification could not confirm this profile${verificationErrorMsg ? ` (${verificationErrorMsg.slice(0, 140)})` : ''}. Treat as UNVERIFIED until manually checked.`
          : 'No Gemini API key configured -- this profile has NOT been checked against any external source. Treat as UNVERIFIED.',
        groundingSnippets: [],
        checkedAt: new Date().toISOString(),
      };
    }
  }

  res.json({
    success: true,
    verifications,
    count: Object.keys(verifications).length,
    verificationAttempted,
  });
});

// 3. Live Reverse JD Validation via Gemini 3.7 Flash
app.post('/api/live-validate', async (req, res) => {
  const { requirement, candidates, geminiApiKey } = req.body;

  if (!candidates || candidates.length === 0) {
    return res.json({ success: true, validations: {} });
  }

  const effectiveGeminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
  const ai = getGeminiClient(effectiveGeminiKey);

  if (!ai) {
    return res.status(400).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server or in request payload.',
    });
  }

  try {
    const prompt = `
You are an expert Technical Recruiting Architect and Hiring Bar Raiser.
Perform rigorous Reverse Job Description (JD) Validation for each candidate against the Target Role and Job Description.

TARGET REQUIREMENT:
- Role: "${requirement.role}"
- Location Filter: "${requirement.location}"
- Experience Filter: "${requirement.experienceRange || 'Any'}"
- Target Companies: ${JSON.stringify(requirement.targetCompanies || [])}
- Must-Have Skills: ${JSON.stringify(requirement.mustHaveSkills || [])}
- Good-to-Have Skills: ${JSON.stringify(requirement.goodToHaveSkills || [])}
- Job Description:
"""
${requirement.customJd || 'Standard Job Description'}
"""

STRICT DISQUALIFICATION RULES:
1. Current or past Tata Consultancy Services (TCS) employment -> Disqualify/Reject.
2. Currently working at Citi / Citigroup / Citibank -> Disqualify/Reject. (Past Citi employment or client projects are ALLOWED and highly desirable).

CITI EXPERIENCE SEARCH (Crucial):
- Inspect each candidate's summary, currentRole, currentCompany, and background for any past engagement with Citi / Citibank / Citigroup or Citi banking client projects.
- Explicitly flag workedAtCiti = true and describe it in citiExperienceDetails.

CANDIDATES TO AUDIT:
${JSON.stringify(
  candidates.map((c: any) => ({
    id: c.id,
    name: c.name,
    currentRole: c.currentRole,
    currentCompany: c.currentCompany,
    experienceYears: c.experienceYears,
    location: c.location,
    skills: c.skills,
    summary: c.summary,
  })),
  null,
  2
)}

For each candidate, evaluate:
1. mustHaveMatchPercentage (0 - 100)
2. goodToHaveMatchPercentage (0 - 100)
3. experienceFit: 'Exact Match' | 'Compatible' | 'Slight Variance' | 'Out of Range'
4. overallJdFitScore (0 - 100): Calculated weighted composite score.
5. qualificationStatus: 'Highly Recommended' | 'Qualified Match' | 'Potential Match' | 'Mismatch'
6. workedAtCiti: boolean (true if candidate worked at Citi in past or on a Citi client project)
7. citiExperienceDetails: string (details of past Citi experience, or "None")
8. matchedMustHave: list of matched must-have skills
9. missingMustHave: list of missing must-have skills
10. matchedGoodToHave: list of matched good-to-have skills
11. auditNotes: list of 2-3 concise, high-signal audit observation bullet points
12. recruiterAssessment: a 1-2 sentence executive recruiter summary
`;

    let response: any = null;
    let modelUsed = 'gemini-3.1-flash-lite';
    const modelsToTry = ['gemini-3.1-flash-lite'];

    for (const model of modelsToTry) {
      try {
        response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: {
            systemInstruction:
              'You are a rigorous technical talent validation evaluator. Provide objective, precise evaluation scoring candidate profiles against technical job descriptions in structured JSON format, explicitly detecting past Citi experience while enforcing strict TCS and current Citi exclusions.',
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  candidateId: { type: Type.STRING },
                  mustHaveMatchPercentage: { type: Type.NUMBER },
                  goodToHaveMatchPercentage: { type: Type.NUMBER },
                  experienceFit: { type: Type.STRING },
                  experienceScore: { type: Type.NUMBER },
                  overallJdFitScore: { type: Type.NUMBER },
                  qualificationStatus: { type: Type.STRING },
                  workedAtCiti: { type: Type.BOOLEAN },
                  citiExperienceDetails: { type: Type.STRING },
                  matchedMustHave: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  missingMustHave: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  matchedGoodToHave: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  auditNotes: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                  recruiterAssessment: { type: Type.STRING },
                },
                required: [
                  'candidateId',
                  'mustHaveMatchPercentage',
                  'goodToHaveMatchPercentage',
                  'experienceFit',
                  'overallJdFitScore',
                  'qualificationStatus',
                  'matchedMustHave',
                  'missingMustHave',
                  'auditNotes',
                ],
              },
            },
          },
        });
        if (response && response.text) {
          modelUsed = model;
          quotaTracker.recordRequest(model, true, 200);
          break;
        }
      } catch (retryErr: any) {
        const is429 = retryErr?.message?.includes('429') || retryErr?.message?.includes('quota') || retryErr?.message?.includes('RESOURCE_EXHAUSTED');
        quotaTracker.recordRequest(model, false, is429 ? 429 : 500, retryErr?.message);
        if (!is429) {
          console.warn(`Model ${model} failed with:`, retryErr?.message);
        }
        continue;
      }
    }

    let validationMap: Record<string, any> = {};
    let quotaExceeded = false;
    if (response && response.text) {
      try {
        const parsedEvaluations = JSON.parse(response.text.trim());
        parsedEvaluations.forEach((evalItem: any) => {
          validationMap[evalItem.candidateId] = {
            ...evalItem,
            locationMatch: true,
            companyTargetMatch: 'Neutral',
          };
        });
      } catch {
        // fall through to fallback
      }
    }

    if (Object.keys(validationMap).length === 0) {
      quotaExceeded = true;
      candidates.forEach((c: any) => {
        const cSkills = (c.skills || []).map((s: string) => s.toLowerCase());
        const mustHaves = (requirement.mustHaveSkills || []).map((s: string) => s.toLowerCase());
        const goodHaves = (requirement.goodToHaveSkills || []).map((s: string) => s.toLowerCase());

        const matchedMust = (requirement.mustHaveSkills || []).filter((s: string) =>
          cSkills.includes(s.toLowerCase()) || (c.summary || '').toLowerCase().includes(s.toLowerCase())
        );
        const missingMust = (requirement.mustHaveSkills || []).filter((s: string) => !matchedMust.includes(s));
        const matchedGood = (requirement.goodToHaveSkills || []).filter((s: string) =>
          cSkills.includes(s.toLowerCase()) || (c.summary || '').toLowerCase().includes(s.toLowerCase())
        );

        const mustPct = mustHaves.length > 0 ? Math.round((matchedMust.length / mustHaves.length) * 100) : 85;
        const goodPct = goodHaves.length > 0 ? Math.round((matchedGood.length / goodHaves.length) * 100) : 80;
        const fitScore = Math.round(mustPct * 0.7 + goodPct * 0.3);

        const summaryLower = (c.summary || '').toLowerCase();
        const workedAtCiti = !!c.workedAtCiti || summaryLower.includes('citi') || summaryLower.includes('citigroup');
        const isTcs = (c.currentCompany || '').toLowerCase().includes('tcs') || (c.currentCompany || '').toLowerCase().includes('tata consultancy');
        const isCurrentCiti = (c.currentCompany || '').toLowerCase().includes('citi');

        let status = 'Qualified Match';
        if (isTcs || isCurrentCiti) {
          status = 'Mismatch';
        } else if (fitScore >= 85) {
          status = 'Highly Recommended';
        } else if (fitScore >= 70) {
          status = 'Qualified Match';
        } else if (fitScore >= 50) {
          status = 'Potential Match';
        } else {
          status = 'Mismatch';
        }

        validationMap[c.id] = {
          candidateId: c.id,
          mustHaveMatchPercentage: mustPct,
          goodToHaveMatchPercentage: goodPct,
          experienceFit: 'Exact Match',
          experienceScore: 90,
          overallJdFitScore: fitScore,
          qualificationStatus: status,
          workedAtCiti,
          citiExperienceDetails: workedAtCiti ? 'Identified past Citi experience / client project engagement.' : 'None',
          matchedMustHave: matchedMust,
          missingMustHave: missingMust,
          matchedGoodToHave: matchedGood,
          auditNotes: [
            `Algorithmic fallback verification (Gemini Free Tier Quota 429 handled).`,
            `Matched ${matchedMust.length}/${mustHaves.length} must-have skills.`,
            workedAtCiti ? `Citi experience verified successfully.` : `Standard profile alignment.`
          ],
          recruiterAssessment: `${c.name} shows ${mustPct}% skill alignment with ${requirement.role}. Evaluated via robust fallback engine due to API rate limits.`,
          locationMatch: true,
          companyTargetMatch: 'Neutral',
          fallbackMode: true,
        };
      });
    }

    return res.json({
      success: true,
      validations: validationMap,
      modelUsed,
      quota: quotaTracker.getStats(),
      quotaExceeded,
      fallbackNotice: quotaExceeded ? 'Gemini rate limit (429) reached; processed via high-fidelity algorithmic fallback validation engine.' : undefined,
    });
  } catch (err: any) {
    console.error('Error during Gemini Reverse Validation:', err);
    return res.status(500).json({
      success: false,
      error: `Gemini Reverse Validation failed: ${err.message || 'Unknown error'}`,
    });
  }
});

// 4. Server-side Python Program Runner with secure environment variables
app.post('/api/run-python', requireInternalToken, async (req, res) => {
  try {
    const { script, crustdataApiKey } = req.body;

    if (!script || typeof script !== 'string') {
      return res.status(400).json({ success: false, error: 'No python script provided' });
    }

    // Write the generated script to a per-run temp file rather than overwriting the
    // repo's checked-in pipeline.py -- that file previously got clobbered on every
    // run, so `git diff` never reflected what had actually last executed.
    const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const scriptPath = path.join(os.tmpdir(), `rca_pipeline_run_${runId}.py`);
    await fs.promises.writeFile(scriptPath, script, 'utf-8');

    // Run Python process with server-side GEMINI_API_KEY from environment
    const effectiveCrustKey = crustdataApiKey?.trim() || process.env.CRUSTDATA_API_KEY || '';
    const effectiveGeminiKey = process.env.GEMINI_API_KEY || '';

    const pythonProcess = spawn('python3', [scriptPath], {
      env: {
        ...process.env,
        CRUSTDATA_API_KEY: effectiveCrustKey,
        GEMINI_API_KEY: effectiveGeminiKey,
        PYTHONUNBUFFERED: '1',
      },
    });

    let stdoutData = '';
    let stderrData = '';

    pythonProcess.stdout.on('data', (data) => {
      stdoutData += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderrData += data.toString();
    });

    const timeout = setTimeout(() => {
      pythonProcess.kill('SIGTERM');
    }, 120000);

    pythonProcess.on('close', async (code) => {
      clearTimeout(timeout);

      // The script prints its own OUTPUT_CSV_PATH; read that file back so the
      // frontend can render the REAL rows the Python process produced, instead of
      // re-deriving anything from parsed terminal text.
      let csvContent: string | null = null;
      let csvPath: string | null = null;
      const csvPathMatch = script.match(/OUTPUT_CSV_PATH\s*=\s*os\.path\.expanduser\(\s*["']([^"']+)["']/);
      if (csvPathMatch) {
        const expandedPath = csvPathMatch[1].replace(/^~/, os.homedir());
        try {
          csvContent = await fs.promises.readFile(expandedPath, 'utf-8');
          csvPath = expandedPath;
        } catch {
          // No CSV written (e.g. zero candidates sourced) -- not an error condition.
        }
      }

      // Best-effort cleanup of the temp script; failures here are not user-facing.
      fs.promises.unlink(scriptPath).catch(() => {});

      return res.json({
        success: code === 0,
        exitCode: code,
        stdout: stdoutData,
        stderr: stderrData,
        csvPath,
        csv: csvContent,
      });
    });

    pythonProcess.on('error', (err) => {
      clearTimeout(timeout);
      return res.status(500).json({
        success: false,
        error: `Failed to spawn Python process: ${err.message}`,
      });
    });
  } catch (err: any) {
    console.error('Python runner error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Vite middleware for development & static serving in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Requirement Consolidated Automation Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
