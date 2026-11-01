/// Provider registry. Every supported backend is described here once, so the
/// UI and the transport layer never hard-code a vendor.

export type ProviderId = 'openrouter' | 'gemini' | 'nvidia' | 'custom';

export type ProviderFamily = 'openai-compatible' | 'gemini';

export type Accent = 'cyan' | 'blue' | 'green' | 'violet';

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  short: string;
  family: ProviderFamily;
  tagline: string;
  keyLabel: string;
  /** Expected key prefix, used for a friendly early warning. `null` = unknown. */
  keyPrefix: string | null;
  keyUrl: string;
  keyUrlLabel: string;
  baseUrl: string;
  defaultModel: string;
  needsBaseUrl: boolean;
  freeTier: string;
  accent: Accent;
  /** Env var that can supply a host-side key for this provider. */
  hostEnv?: 'OPENROUTER_API_KEY' | 'GEMINI_API_KEY' | 'NVIDIA_API_KEY';
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  free?: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    short: 'OpenRouter',
    family: 'openai-compatible',
    tagline: 'One key, hundreds of models. Free router included.',
    keyLabel: 'OpenRouter key',
    keyPrefix: 'sk-or-',
    keyUrl: 'https://openrouter.ai/keys',
    keyUrlLabel: 'openrouter.ai/keys',
    baseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openrouter/free',
    needsBaseUrl: false,
    freeTier: 'Free models available — no card required',
    accent: 'cyan',
    hostEnv: 'OPENROUTER_API_KEY',
  },
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    short: 'Gemini',
    family: 'gemini',
    tagline: 'Gemini 2.5 with search grounding and image generation.',
    keyLabel: 'Google AI Studio key',
    keyPrefix: 'AIza',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyUrlLabel: 'aistudio.google.com/apikey',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    needsBaseUrl: false,
    freeTier: 'Generous free tier in AI Studio',
    accent: 'blue',
    hostEnv: 'GEMINI_API_KEY',
  },
  nvidia: {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    short: 'NVIDIA',
    family: 'openai-compatible',
    tagline: 'Llama, Nemotron, DeepSeek and more on build.nvidia.com.',
    keyLabel: 'NVIDIA API key',
    keyPrefix: 'nvapi-',
    keyUrl: 'https://build.nvidia.com/explore/discover',
    keyUrlLabel: 'build.nvidia.com',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'meta/llama-3.3-70b-instruct',
    needsBaseUrl: false,
    freeTier: 'Free developer credits on build.nvidia.com',
    accent: 'green',
    hostEnv: 'NVIDIA_API_KEY',
  },
  custom: {
    id: 'custom',
    name: 'Custom endpoint',
    short: 'Custom',
    family: 'openai-compatible',
    tagline: 'Any OpenAI-compatible URL: Groq, Together, Ollama, vLLM…',
    keyLabel: 'API key (optional for local)',
    keyPrefix: null,
    keyUrl: 'https://platform.openai.com/docs/api-reference/chat',
    keyUrlLabel: 'OpenAI-compatible spec',
    baseUrl: '',
    defaultModel: '',
    needsBaseUrl: true,
    freeTier: 'Whatever your endpoint allows',
    accent: 'violet',
  },
};

export const PROVIDER_LIST: ProviderMeta[] = [
  PROVIDERS.openrouter,
  PROVIDERS.gemini,
  PROVIDERS.nvidia,
  PROVIDERS.custom,
];

export const ACCENT_CLASSES: Record<
  Accent,
  {
    text: string;
    border: string;
    bg: string;
    ring: string;
    dot: string;
    gradient: string;
    shadow: string;
  }
> = {
  cyan: {
    text: 'text-cyan-300',
    border: 'border-cyan-500/40',
    bg: 'bg-cyan-500/10',
    ring: 'ring-cyan-500/40',
    dot: 'bg-cyan-400',
    gradient: 'from-cyan-400 to-cyan-600',
    shadow: 'shadow-cyan-500/20',
  },
  blue: {
    text: 'text-blue-300',
    border: 'border-blue-500/40',
    bg: 'bg-blue-500/10',
    ring: 'ring-blue-500/40',
    dot: 'bg-blue-400',
    gradient: 'from-blue-400 to-indigo-600',
    shadow: 'shadow-blue-500/20',
  },
  green: {
    text: 'text-emerald-300',
    border: 'border-emerald-500/40',
    bg: 'bg-emerald-500/10',
    ring: 'ring-emerald-500/40',
    dot: 'bg-emerald-400',
    gradient: 'from-emerald-400 to-green-600',
    shadow: 'shadow-emerald-500/20',
  },
  violet: {
    text: 'text-violet-300',
    border: 'border-violet-500/40',
    bg: 'bg-violet-500/10',
    ring: 'ring-violet-500/40',
    dot: 'bg-violet-400',
    gradient: 'from-violet-400 to-fuchsia-600',
    shadow: 'shadow-violet-500/20',
  },
};

export function providerMeta(id: ProviderId): ProviderMeta {
  return PROVIDERS[id] ?? PROVIDERS.openrouter;
}
