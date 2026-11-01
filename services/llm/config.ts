/// Persistent LLM configuration. Keys live in localStorage only — they are
/// never sent anywhere except the provider's own endpoint.

import { useSyncExternalStore } from 'react';
import { PROVIDERS, PROVIDER_LIST, type ProviderId } from './providers';

const ACTIVE_PROVIDER_KEY = 'duet.provider.active';
const MODEL_PREFIX = 'duet.provider.model.';
const KEY_PREFIX = 'duet.provider.key.';
const BASE_URL_KEY = 'duet.provider.baseUrl.custom';
const TEMPERATURE_KEY = 'duet.temperature';
const LEGACY_OPENROUTER_KEY = 'duet-openrouter-key';

export interface LlmConfig {
  provider: ProviderId;
  model: string;
  temperature: number;
  customBaseUrl: string;
}

/** Host-side keys a deployment may inject at build time (never required). */
export const HOST_KEYS: Record<ProviderId, string> = {
  openrouter: readHostKey(process.env.OPENROUTER_API_KEY),
  gemini: readHostKey(process.env.GEMINI_API_KEY || process.env.API_KEY),
  nvidia: readHostKey(process.env.NVIDIA_API_KEY),
  custom: '',
};

function readHostKey(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage may be blocked (private mode / quota). The app still works in memory.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

function isProviderId(value: string | null): value is ProviderId {
  return !!value && Object.prototype.hasOwnProperty.call(PROVIDERS, value);
}

function migrateLegacyKey(): void {
  const legacy = safeGet(LEGACY_OPENROUTER_KEY);
  if (!legacy) return;
  if (!safeGet(`${KEY_PREFIX}openrouter`)) safeSet(`${KEY_PREFIX}openrouter`, legacy);
  safeRemove(LEGACY_OPENROUTER_KEY);
  safeRemove('duet-active-model');
  safeRemove('duet-free-models');
}

function readProvider(): ProviderId {
  migrateLegacyKey();
  const stored = safeGet(ACTIVE_PROVIDER_KEY);
  if (isProviderId(stored)) return stored;
  // Prefer a provider that already has a key.
  const withKey = PROVIDER_LIST.find((p) => !!getApiKey(p.id));
  return withKey?.id ?? 'openrouter';
}

export function getConfig(): LlmConfig {
  const provider = readProvider();
  const meta = PROVIDERS[provider];
  const model = safeGet(`${MODEL_PREFIX}${provider}`) || meta.defaultModel;
  const rawTemp = Number(safeGet(TEMPERATURE_KEY));
  return {
    provider,
    model,
    temperature: Number.isFinite(rawTemp) && rawTemp > 0 && rawTemp <= 2 ? rawTemp : 0.85,
    customBaseUrl: safeGet(BASE_URL_KEY) || '',
  };
}

export function getApiKey(provider: ProviderId): string {
  return safeGet(`${KEY_PREFIX}${provider}`) || HOST_KEYS[provider] || '';
}

export function hasUserKey(provider: ProviderId): boolean {
  return !!safeGet(`${KEY_PREFIX}${provider}`);
}

export function hasHostKey(provider: ProviderId): boolean {
  return !!HOST_KEYS[provider];
}

export function getCustomBaseUrl(): string {
  return safeGet(BASE_URL_KEY) || '';
}

export function isProviderReady(provider: ProviderId): boolean {
  if (provider === 'custom') {
    return !!getCustomBaseUrl() && (!!getApiKey('custom') || !PROVIDERS.custom.keyPrefix);
  }
  return !!getApiKey(provider);
}

export function isConnected(): boolean {
  const config = getConfig();
  return isProviderReady(config.provider);
}

/** Which providers can be used right now (user key or host key). */
export function readyProviders(): ProviderId[] {
  return PROVIDER_LIST.filter((p) => isProviderReady(p.id)).map((p) => p.id);
}

/* -------------------------------------------------------------------------- */
/* Store                                                                      */
/* -------------------------------------------------------------------------- */

let listeners: Array<() => void> = [];
let snapshot: LlmConfig = getConfig();

function refresh(): void {
  snapshot = getConfig();
  listeners.forEach((fn) => fn());
}

export function subscribe(fn: () => void): () => void {
  listeners = [...listeners, fn];
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function getSnapshot(): LlmConfig {
  return snapshot;
}

/** Reactive config for React components. */
export function useLlmConfig(): LlmConfig {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function setConfig(patch: Partial<LlmConfig>): LlmConfig {
  if (patch.provider && patch.provider !== getConfig().provider) {
    safeSet(ACTIVE_PROVIDER_KEY, patch.provider);
  }
  if (patch.model !== undefined) {
    const provider = patch.provider ?? getConfig().provider;
    safeSet(`${MODEL_PREFIX}${provider}`, patch.model);
  }
  if (patch.temperature !== undefined) {
    safeSet(TEMPERATURE_KEY, String(patch.temperature));
  }
  if (patch.customBaseUrl !== undefined) {
    safeSet(BASE_URL_KEY, patch.customBaseUrl.replace(/\/+$/, ''));
  }
  refresh();
  return snapshot;
}

export function setApiKey(provider: ProviderId, key: string): void {
  const trimmed = key.trim();
  if (trimmed) safeSet(`${KEY_PREFIX}${provider}`, trimmed);
  else safeRemove(`${KEY_PREFIX}${provider}`);
  refresh();
}

export function setModel(provider: ProviderId, model: string): void {
  const trimmed = model.trim();
  if (trimmed) safeSet(`${MODEL_PREFIX}${provider}`, trimmed);
  else safeRemove(`${MODEL_PREFIX}${provider}`);
  refresh();
}

/** Forget a provider's key and its saved model, then fall back to another one. */
export function forgetProvider(provider: ProviderId): void {
  safeRemove(`${KEY_PREFIX}${provider}`);
  safeRemove(`${MODEL_PREFIX}${provider}`);
  if (provider === 'custom') safeRemove(BASE_URL_KEY);
  if (readProvider() === provider) {
    const fallback = PROVIDER_LIST.find((p) => p.id !== provider && isProviderReady(p.id));
    if (fallback) safeSet(ACTIVE_PROVIDER_KEY, fallback.id);
  }
  refresh();
}

export function forgetAll(): void {
  PROVIDER_LIST.forEach((p) => {
    safeRemove(`${KEY_PREFIX}${p.id}`);
    safeRemove(`${MODEL_PREFIX}${p.id}`);
  });
  safeRemove(BASE_URL_KEY);
  safeRemove(ACTIVE_PROVIDER_KEY);
  refresh();
}

/** Keep multiple tabs in sync. */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (!event.key || event.key.startsWith('duet.')) refresh();
  });
}
