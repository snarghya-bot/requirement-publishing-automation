import { RoleConfig, RoleType } from '../types';
import { ROLE_CONFIGS, AVAILABLE_ROLES } from '../data/roleDefaults';

const STORAGE_KEY_ROLES = 'rca_role_configs_v2';
const STORAGE_KEY_CUSTOM_ROLES = 'rca_custom_roles_list_v2';

// In-memory cache
let cachedConfigs: Record<string, RoleConfig> | null = null;

export function getInitialRoleConfigs(): Record<string, RoleConfig> {
  const merged: Record<string, RoleConfig> = { ...ROLE_CONFIGS };

  try {
    const savedCustom = localStorage.getItem(STORAGE_KEY_ROLES);
    if (savedCustom) {
      const parsed: Record<string, RoleConfig> = JSON.parse(savedCustom);
      Object.assign(merged, parsed);
    }
  } catch (e) {
    console.warn('Failed to load roles from localStorage', e);
  }

  cachedConfigs = merged;
  return merged;
}

export function getAllRoleConfigs(): Record<string, RoleConfig> {
  if (!cachedConfigs) {
    return getInitialRoleConfigs();
  }
  return cachedConfigs;
}

export function getRoleConfig(roleName: string): RoleConfig {
  const all = getAllRoleConfigs();
  if (all[roleName]) {
    return all[roleName];
  }

  // Fallback for new unconfigured role
  return {
    role: roleName,
    title: `${roleName} Specialist`,
    defaultJd: `Job description for ${roleName}. Responsible for designing, implementing, and supporting ${roleName} enterprise systems.`,
    defaultMustHaveSkills: [],
    defaultGoodToHaveSkills: [],
    isCustom: true,
  };
}

export function getAvailableRoleList(): {
  role: string;
  isCustom: boolean;
  isModified: boolean;
  title: string;
}[] {
  const allConfigs = getAllRoleConfigs();
  const standardSet = new Set(AVAILABLE_ROLES as string[]);

  const list: { role: string; isCustom: boolean; isModified: boolean; title: string }[] = [];

  // 1. Add standard roles
  for (const role of AVAILABLE_ROLES) {
    const config = allConfigs[role];
    const isMod = !!config?.isModified;
    list.push({
      role,
      isCustom: false,
      isModified: isMod,
      title: config?.title || role,
    });
  }

  // 2. Add custom roles
  for (const [roleName, config] of Object.entries(allConfigs)) {
    if (!standardSet.has(roleName)) {
      list.push({
        role: roleName,
        isCustom: true,
        isModified: !!config.isModified,
        title: config.title || roleName,
      });
    }
  }

  return list;
}

export async function saveRoleToDb(config: RoleConfig): Promise<{ success: boolean; config: RoleConfig }> {
  const isDefaultPreset = AVAILABLE_ROLES.includes(config.role as any);
  const now = new Date().toISOString();

  const updatedConfig: RoleConfig = {
    ...config,
    isCustom: !isDefaultPreset,
    isModified: true,
    updatedAt: now,
    createdAt: config.createdAt || now,
  };

  // Update local memory & localStorage
  const current = { ...getAllRoleConfigs(), [config.role]: updatedConfig };
  cachedConfigs = current;

  try {
    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to save role config to localStorage', e);
  }

  // Sync to backend DB endpoint
  try {
    await fetch('/api/roles/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleConfig: updatedConfig }),
    });
  } catch (err) {
    console.warn('Failed to sync saved role to server API', err);
  }

  return { success: true, config: updatedConfig };
}

export async function deleteRoleFromDb(roleName: string): Promise<{ success: boolean }> {
  const isDefaultPreset = AVAILABLE_ROLES.includes(roleName as any);
  if (isDefaultPreset) {
    // If standard preset, we cannot delete, only reset
    return resetRoleInDb(roleName);
  }

  const current = { ...getAllRoleConfigs() };
  delete current[roleName];
  cachedConfigs = current;

  try {
    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to delete role config from localStorage', e);
  }

  // Sync delete to backend DB endpoint
  try {
    await fetch('/api/roles/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleName }),
    });
  } catch (err) {
    console.warn('Failed to sync role deletion to server API', err);
  }

  return { success: true };
}

export async function resetRoleInDb(roleName: string): Promise<{ success: boolean; config: RoleConfig }> {
  const isDefaultPreset = AVAILABLE_ROLES.includes(roleName as any);
  const current = { ...getAllRoleConfigs() };

  let restoredConfig: RoleConfig;
  if (isDefaultPreset && ROLE_CONFIGS[roleName as any]) {
    restoredConfig = { ...ROLE_CONFIGS[roleName as any], isModified: false };
    current[roleName] = restoredConfig;
  } else {
    // Blank template for custom role
    restoredConfig = {
      role: roleName,
      title: `${roleName} Specialist`,
      defaultJd: `Job description for ${roleName}. Responsible for designing, implementing, and supporting ${roleName} enterprise systems.`,
      defaultMustHaveSkills: [],
      defaultGoodToHaveSkills: [],
      isCustom: true,
      isModified: false,
    };
    current[roleName] = restoredConfig;
  }

  cachedConfigs = current;
  try {
    localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(current));
  } catch (e) {
    console.warn('Failed to reset role config in localStorage', e);
  }

  // Sync reset to backend DB endpoint
  try {
    await fetch('/api/roles/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleName }),
    });
  } catch (err) {
    console.warn('Failed to sync role reset to server API', err);
  }

  return { success: true, config: restoredConfig };
}

export async function syncRolesWithServer(): Promise<Record<string, RoleConfig>> {
  try {
    const res = await fetch('/api/roles');
    const json = await res.json();
    if (json && json.success && json.roles) {
      const merged = { ...getInitialRoleConfigs(), ...json.roles };
      cachedConfigs = merged;
      localStorage.setItem(STORAGE_KEY_ROLES, JSON.stringify(merged));
      return merged;
    }
  } catch (err) {
    console.warn('Server roles API sync skipped, using local data', err);
  }
  return getAllRoleConfigs();
}
