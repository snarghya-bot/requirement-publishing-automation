// Shared helper for attaching the optional internal auth token to mutating /api requests.
//
// Background: /api/run-python executes arbitrary server-supplied Python with real
// Crustdata/Gemini API keys in its environment, and the /api/roles and /api/companies
// write endpoints mutate server-side JSON files -- none of them were protected by any
// authentication. That's acceptable for purely local development, but a real hole if
// this server is ever exposed beyond localhost (e.g. the Cloud Run URL referenced in
// .env.example). server.ts now optionally enforces an INTERNAL_API_TOKEN shared-secret
// header (via the requireInternalToken middleware) whenever that env var is set on the
// server. This helper reads the same token from local API-key config (if the user has
// set one in the API Credentials modal) and attaches it to every mutating request.
const STORAGE_KEY = 'rca_api_keys_config';

export function getInternalApiToken(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return (parsed?.internalApiToken || '').trim();
    }
  } catch {
    // ignore -- fall through to empty token
  }
  return '';
}

export function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getInternalApiToken();
  return {
    ...extra,
    ...(token ? { 'x-internal-token': token } : {}),
  };
}
