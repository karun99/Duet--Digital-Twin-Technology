/// Transport layer: one interface over OpenRouter, Google Gemini, NVIDIA NIM
/// and any OpenAI-compatible endpoint. Streaming, vision, model listing and
/// key validation all go through here.

import { getApiKey, getConfig, getCustomBaseUrl } from './config';
import { PROVIDERS, providerMeta, type ModelInfo, type ProviderId, type ProviderMeta } from './providers';

export type ChatRole = 'system' | 'user' | 'assistant';

export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

export interface ChatMsg {
  role: ChatRole;
  content: string | ContentPart[];
}

export interface ChatRequest {
  messages: ChatMsg[];
  system?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  provider?: ProviderId;
  onDelta?: (fullText: string) => void;
  signal?: AbortSignal;
}

export class LlmError extends Error {
  status?: number;
  provider: ProviderId;
  retryable: boolean;

  constructor(message: string, provider: ProviderId, status?: number, retryable = false) {
    super(message);
    this.name = 'LlmError';
    this.provider = provider;
    this.status = status;
    this.retryable = retryable;
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const NON_CHAT_HINTS = [
  'embedding',
  'embed-',
  'whisper',
  'tts',
  'moderation',
  'rerank',
  'clip',
  'lyria',
  'imagen',
  'dall-e',
  'stable-diffusion',
  'flux',
  'sdxl',
  'guard',
  'safety',
  'deplot',
  'kosmos',
  'nv-embed',
  'retriever',
  'parse',
  'ocr',
];

export function looksLikeChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  return !NON_CHAT_HINTS.some((hint) => lower.includes(hint));
}

export function resolveBaseUrl(provider: ProviderId, override?: string): string {
  const meta = providerMeta(provider);
  const raw = (override ?? (provider === 'custom' ? getCustomBaseUrl() : meta.baseUrl) ?? '').trim();
  if (!raw) {
    throw new LlmError(
      provider === 'custom'
        ? 'Add the base URL of your endpoint (for example https://api.groq.com/openai/v1).'
        : `${meta.name} has no endpoint configured.`,
      provider
    );
  }
  return raw
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '')
    .replace(/\/models$/, '');
}

function authHeaders(provider: ProviderId, key: string): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  if (provider === 'openrouter') {
    if (typeof window !== 'undefined') headers['HTTP-Referer'] = window.location.origin;
    headers['X-Title'] = 'Duet Digital Twin';
  }
  return headers;
}

function readProviderMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    const candidate =
      parsed?.error?.message ??
      parsed?.error?.detail ??
      parsed?.message ??
      parsed?.detail ??
      (Array.isArray(parsed?.errors) ? parsed.errors[0]?.message : null);
    return typeof candidate === 'string' && candidate ? candidate : null;
  } catch {
    const trimmed = body.trim();
    return trimmed && trimmed.length < 240 ? trimmed : null;
  }
}

function errorFromResponse(provider: ProviderId, status: number, body: string): LlmError {
  const meta = providerMeta(provider);
  const detail = readProviderMessage(body);
  const suffix = detail ? ` ${detail}` : '';

  if (status === 401 || status === 403) {
    return new LlmError(
      `${meta.name} rejected that key. Check it in Settings and try again.${suffix}`,
      provider,
      status,
      false
    );
  }
  if (status === 402) {
    return new LlmError(`${meta.name} says this model needs credits.${suffix}`, provider, status, true);
  }
  if (status === 404) {
    return new LlmError(
      `${meta.name} could not find that model or endpoint. Pick another model in Settings.${suffix}`,
      provider,
      status,
      true
    );
  }
  if (status === 413) {
    return new LlmError(`The conversation is too long for ${meta.name}. Restart the session.`, provider, status, false);
  }
  if (status === 429) {
    return new LlmError(`${meta.name} is rate-limiting this key. Give it a moment.${suffix}`, provider, status, true);
  }
  if (status >= 500) {
    return new LlmError(`${meta.name} is having trouble right now (HTTP ${status}).${suffix}`, provider, status, true);
  }
  return new LlmError(`${meta.name} responded with HTTP ${status}.${suffix}`, provider, status, status >= 408);
}

async function assertOk(response: Response, provider: ProviderId): Promise<void> {
  if (response.ok) return;
  const body = await response.text().catch(() => '');
  throw errorFromResponse(provider, response.status, body);
}

/* -------------------------------------------------------------------------- */
/* Message shaping                                                            */
/* -------------------------------------------------------------------------- */

function toParts(content: string | ContentPart[]): ContentPart[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return content;
}

function toOpenAiMessages(messages: ChatMsg[], system?: string): unknown[] {
  const out: unknown[] = [];
  if (system) out.push({ role: 'system', content: system });
  for (const message of messages) {
    if (typeof message.content === 'string') {
      out.push({ role: message.role, content: message.content });
      continue;
    }
    const parts = toParts(message.content);
    const hasImage = parts.some((part) => part.type === 'image');
    if (!hasImage) {
      out.push({
        role: message.role,
        content: parts.map((part) => (part.type === 'text' ? part.text : '')).join('\n'),
      });
      continue;
    }
    out.push({
      role: message.role,
      content: parts.map((part) =>
        part.type === 'text'
          ? { type: 'text', text: part.text }
          : { type: 'image_url', image_url: { url: `data:${part.mimeType};base64,${part.data}` } }
      ),
    });
  }
  return out;
}

function toGeminiContents(messages: ChatMsg[]): unknown[] {
  return messages
    .filter((message) => message.role !== 'system')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: toParts(message.content).map((part) =>
        part.type === 'text'
          ? { text: part.text }
          : { inlineData: { mimeType: part.mimeType, data: part.data } }
      ),
    }));
}

/* -------------------------------------------------------------------------- */
/* Streaming readers                                                          */
/* -------------------------------------------------------------------------- */

async function readSse(
  response: Response,
  onEvent: (payload: unknown) => void
): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    // Gemini and some gateways use CRLF framing; normalise before splitting.
    buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');

    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          onEvent(JSON.parse(data));
        } catch {
          // Ignore keep-alives and malformed fragments.
        }
      }
      boundary = buffer.indexOf('\n\n');
    }
  }
}

/* -------------------------------------------------------------------------- */
/* OpenAI-compatible transport                                                */
/* -------------------------------------------------------------------------- */

interface OpenAiOptions {
  model: string;
  messages: unknown[];
  temperature?: number;
  maxTokens?: number;
  stream: boolean;
}

async function openAiCompatible(
  provider: ProviderId,
  key: string,
  baseUrl: string,
  options: OpenAiOptions,
  onDelta?: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: authHeaders(provider, key),
    body: JSON.stringify({
      model: options.model,
      messages: options.messages,
      temperature: options.temperature,
      stream: options.stream,
      ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
    }),
    signal,
  });

  await assertOk(response, provider);

  const contentType = response.headers.get('content-type') ?? '';

  if (!options.stream || !response.body || !contentType.includes('event-stream')) {
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((p: any) => p?.text ?? '').join('') : '';
    if (!text) {
      throw new LlmError(`${providerMeta(provider).name} returned an empty reply. Try another model.`, provider, 200, true);
    }
    onDelta?.(text);
    return text;
  }

  let full = '';
  await readSse(response, (payload: any) => {
    const delta = payload?.choices?.[0]?.delta;
    const piece =
      typeof delta?.content === 'string'
        ? delta.content
        : Array.isArray(delta?.content)
          ? delta.content.map((p: any) => p?.text ?? '').join('')
          : '';
    if (piece) {
      full += piece;
      onDelta?.(full);
    }
  });

  if (!full.trim()) {
    throw new LlmError(`${providerMeta(provider).name} returned an empty reply. Try another model.`, provider, 200, true);
  }
  return full;
}

/* -------------------------------------------------------------------------- */
/* Gemini transport                                                           */
/* -------------------------------------------------------------------------- */

async function geminiChat(
  provider: ProviderId,
  key: string,
  baseUrl: string,
  model: string,
  messages: ChatMsg[],
  system: string | undefined,
  temperature: number | undefined,
  maxTokens: number | undefined,
  stream: boolean,
  onDelta?: (fullText: string) => void,
  signal?: AbortSignal
): Promise<string> {
  if (!key) {
    throw new LlmError('Google Gemini needs an API key. Add one in Settings.', provider, 401, false);
  }

  const method = stream ? 'streamGenerateContent' : 'generateContent';
  const url = `${baseUrl}/models/${encodeURIComponent(model)}:${method}${stream ? '?alt=sse&' : '?'}key=${encodeURIComponent(key)}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: toGeminiContents(messages),
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        temperature: temperature ?? 0.85,
        ...(maxTokens ? { maxOutputTokens: maxTokens } : {}),
      },
    }),
    signal,
  });

  await assertOk(response, provider);

  const extract = (payload: any): string => {
    const parts = payload?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return '';
    return parts.map((part: any) => (typeof part?.text === 'string' ? part.text : '')).join('');
  };

  const contentType = response.headers.get('content-type') ?? '';

  if (!stream || !response.body || !contentType.includes('event-stream')) {
    const data = await response.json();
    const text = extract(data);
    if (!text) {
      const blocked = data?.promptFeedback?.blockReason;
      throw new LlmError(
        blocked ? `Gemini blocked that request (${blocked}).` : 'Gemini returned an empty reply.',
        provider,
        200,
        !blocked
      );
    }
    onDelta?.(text);
    return text;
  }

  let full = '';
  await readSse(response, (payload) => {
    const piece = extract(payload);
    if (piece) {
      full += piece;
      onDelta?.(full);
    }
  });

  if (!full.trim()) throw new LlmError('Gemini returned an empty reply.', provider, 200, true);
  return full;
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                 */
/* -------------------------------------------------------------------------- */

function candidatesFor(provider: ProviderId, model: string): string[] {
  if (provider !== 'openrouter') return [model];
  const list = [model];
  if (!list.includes('openrouter/free')) list.push('openrouter/free');
  return list;
}

/**
 * One completion. Streams through `onDelta` when the provider supports it and
 * rotates across models on OpenRouter when a free model is busy.
 */
export async function chat(request: ChatRequest): Promise<string> {
  const config = getConfig();
  const provider = request.provider ?? config.provider;
  const meta = providerMeta(provider);
  const key = getApiKey(provider);
  const baseUrl = resolveBaseUrl(provider);
  const model = request.model ?? (provider === config.provider ? config.model : meta.defaultModel) ?? meta.defaultModel;
  const temperature = request.temperature ?? config.temperature;

  if (!key && provider !== 'custom') {
    throw new LlmError(`${meta.name} needs an API key. Add one in Settings.`, provider, 401, false);
  }
  if (!model) {
    throw new LlmError('Pick a model for this provider in Settings.', provider);
  }

  const messages = request.messages;
  const openAiMessages = toOpenAiMessages(messages, request.system);
  const attempts = candidatesFor(provider, model);
  let lastError: unknown = null;

  for (const candidate of attempts) {
    try {
      if (meta.family === 'gemini') {
        return await geminiChat(
          provider,
          key,
          baseUrl,
          candidate,
          messages,
          request.system,
          temperature,
          request.maxTokens,
          true,
          request.onDelta,
          request.signal
        );
      }
      return await openAiCompatible(
        provider,
        key,
        baseUrl,
        {
          model: candidate,
          messages: openAiMessages,
          temperature,
          maxTokens: request.maxTokens,
          stream: true,
        },
        request.onDelta,
        request.signal
      );
    } catch (error) {
      lastError = error;
      if (request.signal?.aborted) throw error;
      const retryable = error instanceof LlmError ? error.retryable : true;
      if (!retryable) throw error;
    }
  }

  if (lastError instanceof Error) throw lastError;
  throw new LlmError(`${meta.name} did not respond. Try again in a moment.`, provider);
}

/** Non-streaming convenience wrapper for small internal tasks. */
export async function complete(messages: ChatMsg[], system?: string, maxTokens?: number): Promise<string> {
  return chat({ messages, system, maxTokens });
}

/* -------------------------------------------------------------------------- */
/* Model listing + key validation                                             */
/* -------------------------------------------------------------------------- */

const modelCache = new Map<string, { at: number; models: ModelInfo[] }>();
const MODEL_CACHE_TTL = 10 * 60 * 1000;

function isFreeModel(model: { id: string; pricing?: Record<string, string> }): boolean {
  if (model.id.endsWith(':free')) return true;
  const pricing = model.pricing;
  return !!pricing && pricing.prompt === '0' && pricing.completion === '0';
}

export async function listModels(provider: ProviderId, key?: string, baseUrl?: string): Promise<ModelInfo[]> {
  const meta = providerMeta(provider);
  const resolvedBase = resolveBaseUrl(provider, baseUrl);
  const cacheKey = `${provider}:${resolvedBase}`;
  const cached = modelCache.get(cacheKey);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL) return cached.models;

  const token = key ?? getApiKey(provider);

  let models: ModelInfo[] = [];

  if (meta.family === 'gemini') {
    const response = await fetch(`${resolvedBase}/models?key=${encodeURIComponent(token)}&pageSize=200`);
    await assertOk(response, provider);
    const payload = await response.json();
    models = (payload?.models ?? [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => ({
        id: String(m.name ?? '').replace(/^models\//, ''),
        name: m.displayName || String(m.name ?? '').replace(/^models\//, ''),
        contextLength: m.inputTokenLimit || undefined,
      }));
  } else {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${resolvedBase}/models`, { headers });
    await assertOk(response, provider);
    const payload = await response.json();
    const rows: any[] = Array.isArray(payload) ? payload : (payload?.data ?? []);
    models = rows
      .map((m: any) => ({
        id: String(m?.id ?? ''),
        name: String(m?.name || m?.id || ''),
        contextLength: Number(m?.context_length || m?.contextLength || 0) || undefined,
        free: provider === 'openrouter' ? isFreeModel({ id: String(m?.id ?? ''), pricing: m?.pricing }) : undefined,
      }))
      .filter((m) => !!m.id && looksLikeChatModel(m.id));
  }

  models.sort((a, b) => {
    if (a.free !== b.free) return a.free ? -1 : 1;
    return (b.contextLength ?? 0) - (a.contextLength ?? 0);
  });

  modelCache.set(cacheKey, { at: Date.now(), models });
  return models;
}

export interface ValidationResult {
  ok: boolean;
  label: string;
  detail: string;
  models?: ModelInfo[];
}

export async function validateKey(
  provider: ProviderId,
  key: string,
  baseUrl?: string
): Promise<ValidationResult> {
  const meta = providerMeta(provider);
  const trimmed = key.trim();
  const resolvedBase = resolveBaseUrl(provider, baseUrl);

  if (provider === 'custom') {
    if (!resolvedBase) throw new LlmError('Add the base URL of your endpoint first.', provider);
    try {
      const models = await listModels(provider, trimmed, resolvedBase);
      return {
        ok: true,
        label: 'Endpoint reachable',
        detail: models.length ? `${models.length} models advertised` : 'Connected (no model list)',
        models,
      };
    } catch {
      return { ok: true, label: 'Endpoint saved', detail: 'No /models endpoint — the key will be tried on first message.' };
    }
  }

  if (provider === 'openrouter') {
    const response = await fetch(`${resolveBaseUrl('openrouter')}/auth/key`, { headers: authHeaders(provider, trimmed) });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new LlmError('OpenRouter rejected that key. Copy it again from openrouter.ai/keys.', provider, response.status);
      }
      throw errorFromResponse(provider, response.status, await response.text().catch(() => ''));
    }
    const payload = await response.json();
    const data = payload?.data ?? {};
    const usage = Number(data.usage ?? 0);
    return {
      ok: true,
      label: data.label ? String(data.label) : 'OpenRouter key',
      detail: data.is_free_tier ? 'Free tier · no card on file' : `Usage $${usage.toFixed(2)}`,
    };
  }

  if (provider === 'nvidia') {
    const models = await listModels(provider, trimmed);
    return { ok: true, label: 'NVIDIA NIM', detail: `${models.length} models available`, models };
  }

  const models = await listModels(provider, trimmed);
  return { ok: true, label: meta.name, detail: `${models.length} models available`, models };
}

export { PROVIDERS, providerMeta };
export type { ModelInfo, ProviderId, ProviderMeta };
