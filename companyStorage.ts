import { POPULAR_COMPANIES } from '../data/roleDefaults';
import { authHeaders } from './apiClient';

const STORAGE_KEY_COMPANIES = 'rca_target_companies_v3';

// Forbidden company list (strict non-negotiable exclusions)
const FORBIDDEN_COMPANIES = [
  'tcs',
  'tata consultancy services',
  'tata consultancy',
  'tata consultancy services limited',
  'tcs limited',
  'tata consultancy services (tcs)',
];

export interface CompanyItem {
  name: string;
  isCustom: boolean;
  createdAt?: string;
}

// In-memory cache
let cachedCompanies: CompanyItem[] | null = null;

export function isCompanyForbidden(companyName: string): boolean {
  const normalized = companyName.trim().toLowerCase();
  return FORBIDDEN_COMPANIES.some(
    (forbidden) =>
      normalized === forbidden ||
      normalized.includes('tcs') ||
      normalized.includes('tata consultancy')
  );
}

export function getInitialCompanies(): CompanyItem[] {
  const defaultItems: CompanyItem[] = POPULAR_COMPANIES.map((name) => ({
    name,
    isCustom: false,
  }));

  try {
    const saved = localStorage.getItem(STORAGE_KEY_COMPANIES);
    if (saved) {
      const parsed: CompanyItem[] = JSON.parse(saved);
      // Merge unique by name, ensuring no forbidden companies
      const nameSet = new Set<string>();
      const merged: CompanyItem[] = [];

      for (const item of [...defaultItems, ...parsed]) {
        if (!isCompanyForbidden(item.name) && !nameSet.has(item.name.toLowerCase())) {
          nameSet.add(item.name.toLowerCase());
          merged.push(item);
        }
      }
      cachedCompanies = merged;
      return merged;
    }
  } catch (e) {
    console.warn('Failed to load companies from localStorage', e);
  }

  cachedCompanies = defaultItems;
  return defaultItems;
}

export function getAllCompanies(): CompanyItem[] {
  if (!cachedCompanies) {
    return getInitialCompanies();
  }
  return cachedCompanies;
}

export function getAllCompanyNames(): string[] {
  return getAllCompanies().map((c) => c.name);
}

export async function saveCompanyToDb(companyName: string): Promise<{
  success: boolean;
  message?: string;
  companies: CompanyItem[];
}> {
  const trimmed = companyName.trim();
  if (!trimmed) {
    throw new Error('Company name cannot be empty.');
  }

  if (isCompanyForbidden(trimmed)) {
    throw new Error(
      `'${trimmed}' is strictly on the non-negotiable exclusion list (TCS) and cannot be added.`
    );
  }

  const current = getAllCompanies();
  const existing = current.find(
    (c) => c.name.toLowerCase() === trimmed.toLowerCase()
  );

  if (existing) {
    return {
      success: true,
      message: `'${trimmed}' is already in the company list.`,
      companies: current,
    };
  }

  const newCompany: CompanyItem = {
    name: trimmed,
    isCustom: true,
    createdAt: new Date().toISOString(),
  };

  const updated = [...current, newCompany];
  cachedCompanies = updated;

  try {
    localStorage.setItem(STORAGE_KEY_COMPANIES, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save company to localStorage', e);
  }

  // Sync to server API
  try {
    await fetch('/api/companies/save', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ company: newCompany }),
    });
  } catch (err) {
    console.warn('Failed to sync saved company to server API', err);
  }

  return {
    success: true,
    message: `✓ Company '${trimmed}' saved to database successfully!`,
    companies: updated,
  };
}

export async function deleteCompanyFromDb(companyName: string): Promise<{
  success: boolean;
  companies: CompanyItem[];
}> {
  const current = getAllCompanies();
  const updated = current.filter(
    (c) => c.name.toLowerCase() !== companyName.toLowerCase()
  );

  cachedCompanies = updated;
  try {
    localStorage.setItem(STORAGE_KEY_COMPANIES, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to delete company from localStorage', e);
  }

  // Sync delete to server API
  try {
    await fetch('/api/companies/delete', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ companyName }),
    });
  } catch (err) {
    console.warn('Failed to sync company deletion to server API', err);
  }

  return { success: true, companies: updated };
}

export async function resetCompaniesToDefault(): Promise<{
  success: boolean;
  companies: CompanyItem[];
}> {
  const defaultItems: CompanyItem[] = POPULAR_COMPANIES.map((name) => ({
    name,
    isCustom: false,
  }));

  cachedCompanies = defaultItems;
  try {
    localStorage.setItem(STORAGE_KEY_COMPANIES, JSON.stringify(defaultItems));
  } catch (e) {
    console.warn('Failed to reset companies in localStorage', e);
  }

  try {
    await fetch('/api/companies/reset', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    });
  } catch (err) {
    console.warn('Failed to sync companies reset to server API', err);
  }

  return { success: true, companies: defaultItems };
}

export async function syncCompaniesWithServer(): Promise<CompanyItem[]> {
  try {
    const res = await fetch('/api/companies');
    const json = await res.json();
    if (json && json.success && Array.isArray(json.companies)) {
      const serverCompanies: CompanyItem[] = json.companies;
      const nameSet = new Set<string>();
      const merged: CompanyItem[] = [];

      for (const item of [...getInitialCompanies(), ...serverCompanies]) {
        if (!isCompanyForbidden(item.name) && !nameSet.has(item.name.toLowerCase())) {
          nameSet.add(item.name.toLowerCase());
          merged.push(item);
        }
      }

      cachedCompanies = merged;
      localStorage.setItem(STORAGE_KEY_COMPANIES, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Server companies API sync skipped, using local data', err);
  }
  return getAllCompanies();
}
