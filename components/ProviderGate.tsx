import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HOST_KEYS,
  PROVIDER_LIST,
  PROVIDERS,
  validateKey,
  listModels,
  type ModelInfo,
  type ProviderId,
  type ValidationResult,
  setApiKey,
  setConfig,
  forgetProvider,
  getApiKey,
  hasUserKey,
  hasHostKey,
  getConfig,
  useLlmConfig,
} from '../services/llm';
import { ACCENT_CLASSES } from '../services/llm/providers';
import { Button, Field, Spinner, inputClass } from './ui';
import {
  IconCheck,
  IconGlobe,
  IconKey,
  IconLayers,
  IconSearch,
  IconShield,
  IconSpark,
  IconTrash,
  IconWarn,
  IconZap,
} from './icons';

interface ProviderGateProps {
  mode?: 'connect' | 'settings';
  onClose?: () => void;
  onReady?: () => void;
}

const PROVIDER_ICON: Record<ProviderId, React.ReactNode> = {
  openrouter: <IconLayers size={18} />,
  gemini: <IconSpark size={18} />,
  nvidia: <IconZap size={18} />,
  custom: <IconGlobe size={18} />,
};

function maskKey(key: string): string {
  if (key.length <= 10) return '••••••••';
  return `${key.slice(0, 6)}${'•'.repeat(Math.min(14, key.length - 10))}${key.slice(-4)}`;
}

export const ProviderGate: React.FC<ProviderGateProps> = ({ mode = 'connect', onClose, onReady }) => {
  const config = useLlmConfig();
  const [provider, setProvider] = useState<ProviderId>(config.provider);
  const meta = PROVIDERS[provider];
  const accent = ACCENT_CLASSES[meta.accent];

  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [manualModel, setManualModel] = useState(false);
  const [status, setStatus] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fetchSeq = useRef(0);

  const storedKey = hasUserKey(provider);
  const hostKey = hasHostKey(provider);
  const effectiveKey = key.trim() || (hostKey ? HOST_KEYS[provider] : '');

  /* Reset the form whenever the provider changes. */
  useEffect(() => {
    const stored = getConfig();
    const savedModel = stored.provider === provider ? stored.model : PROVIDERS[provider].defaultModel;
    setKey('');
    setReveal(false);
    setModel(savedModel || PROVIDERS[provider].defaultModel);
    setBaseUrl(provider === 'custom' ? stored.customBaseUrl : '');
    setModels([]);
    setModelsError(null);
    setSearch('');
    setManualModel(false);
    setStatus(null);
    setError(null);
    setSaved(false);
  }, [provider]);

  const loadModels = useCallback(
    async (token: string, base: string) => {
      const seq = ++fetchSeq.current;
      setModelsLoading(true);
      setModelsError(null);
      try {
        const list = await listModels(provider, token || undefined, base || undefined);
        if (seq !== fetchSeq.current) return;
        setModels(list);
        if (list.length) {
          setModel((current) => (list.some((m) => m.id === current) ? current : list[0].id));
        } else {
          setModelsError('No models advertised — type the model id manually.');
          setManualModel(true);
        }
      } catch (err) {
        if (seq !== fetchSeq.current) return;
        setModels([]);
        setModelsError(err instanceof Error ? err.message : 'Could not list models.');
      } finally {
        if (seq === fetchSeq.current) setModelsLoading(false);
      }
    },
    [provider]
  );

  /* Quietly fetch models once a key looks complete. */
  useEffect(() => {
    if (meta.family === 'gemini' && !effectiveKey) return;
    if (provider === 'custom' && !baseUrl.trim()) return;
    if (!effectiveKey && provider !== 'custom') return;
    if (effectiveKey.length < 12) return;
    const timer = setTimeout(() => loadModels(effectiveKey, baseUrl), 550);
    return () => clearTimeout(timer);
  }, [effectiveKey, baseUrl, provider, meta.family, loadModels]);

  const filteredModels = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = query ? models.filter((m) => `${m.name} ${m.id}`.toLowerCase().includes(query)) : models;
    return list.slice(0, 80);
  }, [models, search]);

  const handleConnect = async () => {
    setError(null);
    setStatus(null);

    if (provider === 'custom' && !baseUrl.trim()) {
      setError('Add the base URL of your endpoint first.');
      return;
    }
    if (!effectiveKey && provider !== 'custom') {
      setError(`Paste your ${meta.keyLabel} to continue.`);
      return;
    }
    if (!model.trim()) {
      setError('Choose a model (or type a model id) before connecting.');
      return;
    }

    setBusy(true);
    try {
      const result = await validateKey(provider, effectiveKey, baseUrl || undefined);
      if (key.trim()) setApiKey(provider, key.trim());
      setConfig({
        provider,
        model: model.trim(),
        customBaseUrl: provider === 'custom' ? baseUrl.trim() : undefined,
      });
      setStatus(result);
      setSaved(true);
      if (mode === 'connect') {
        setTimeout(() => onReady?.(), 420);
      } else {
        setTimeout(() => onClose?.(), 700);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that key.');
    } finally {
      setBusy(false);
    }
  };

  const useHostKey = () => {
    setError(null);
    setApiKey(provider, '');
    setConfig({ provider, model: model.trim() || meta.defaultModel });
    setSaved(true);
    if (mode === 'connect') onReady?.();
    else onClose?.();
  };

  const disconnect = () => {
    forgetProvider(provider);
    setKey('');
    setStatus(null);
    setSaved(false);
    setModels([]);
    setModel(PROVIDERS[provider].defaultModel);
  };

  const canSubmit = !busy && !!model.trim() && (provider === 'custom' || !!effectiveKey);

  const body = (
    <div className={mode === 'connect' ? 'p-5 sm:p-8' : 'p-5 sm:p-7'}>
      {/* Current connection summary */}
      <div className="mb-6 flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3.5 py-2.5">
        <span className={`h-1.5 w-1.5 rounded-full ${config.provider === provider ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">Active</span>
        <span className="truncate text-[12px] text-neutral-200">
          {PROVIDERS[config.provider].name} · {config.model}
        </span>
        {config.provider !== provider && (
          <button
            onClick={() => setProvider(config.provider)}
            className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-cyan-400 hover:text-cyan-300"
          >
            Edit
          </button>
        )}
      </div>

      {/* Provider picker */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROVIDER_LIST.map((item) => {
          const selected = item.id === provider;
          const itemAccent = ACCENT_CLASSES[item.accent];
          const ready = !!getApiKey(item.id) || (item.id === 'custom' && !!getConfig().customBaseUrl);
          return (
            <button
              key={item.id}
              onClick={() => setProvider(item.id)}
              aria-pressed={selected}
              className={`group relative flex flex-col items-start gap-2 rounded-2xl border p-3 text-left transition-all ${
                selected
                  ? `${itemAccent.border} ${itemAccent.bg} ring-1 ${itemAccent.ring}`
                  : 'border-white/[0.07] bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              <span className={`${selected ? itemAccent.text : 'text-neutral-500'} transition-colors`}>
                {PROVIDER_ICON[item.id]}
              </span>
              <span className="text-[12px] font-semibold leading-tight text-white">{item.short}</span>
              <span className="font-mono text-[8px] uppercase tracking-[0.14em] text-neutral-500">
                {ready ? 'linked' : 'connect'}
              </span>
              {ready && (
                <span className="absolute right-2.5 top-2.5 text-emerald-400">
                  <IconCheck size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex items-start gap-2.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
        <span className={`mt-0.5 shrink-0 ${accent.text}`}>{PROVIDER_ICON[provider]}</span>
        <div className="min-w-0">
          <p className="text-[12px] text-neutral-200">{meta.tagline}</p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500">{meta.freeTier}</p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {provider === 'custom' && (
          <Field
            label="Base URL"
            hint={<span className="font-mono text-[9px] text-neutral-600">ends in /v1</span>}
          >
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.groq.com/openai/v1"
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
          </Field>
        )}

        <Field
          label={meta.keyLabel}
          hint={
            <a
              href={meta.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-400 hover:text-cyan-300"
            >
              get one ↗
            </a>
          }
        >
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/50 px-3.5 focus-within:border-cyan-500/60">
            <IconKey size={15} className="shrink-0 text-neutral-600" />
            <input
              type={reveal ? 'text' : 'password'}
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setStatus(null);
                setError(null);
              }}
              placeholder={storedKey ? maskKey(getApiKey(provider)) : meta.keyPrefix ? `${meta.keyPrefix}…` : 'optional for local endpoints'}
              autoComplete="off"
              spellCheck={false}
              className="min-w-0 flex-1 bg-transparent py-3 font-mono text-[12px] text-white placeholder-neutral-600 focus:outline-none"
            />
            {key && (
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500 hover:text-cyan-300"
              >
                {reveal ? 'hide' : 'show'}
              </button>
            )}
          </div>
        </Field>

        {/* Model picker */}
        <Field
          label="Model"
          hint={
            <div className="flex items-center gap-3">
              {models.length > 0 && (
                <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600">
                  {models.length} found
                </span>
              )}
              <button
                type="button"
                onClick={() => setManualModel((v) => !v)}
                className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500 hover:text-cyan-300"
              >
                {manualModel ? 'pick from list' : 'type id'}
              </button>
            </div>
          }
        >
          {manualModel ? (
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder={meta.defaultModel || 'model-id'}
              spellCheck={false}
              autoComplete="off"
              className={`${inputClass} font-mono`}
            />
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/40">
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-3">
                <IconSearch size={14} className="text-neutral-600" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search models…"
                  className="min-w-0 flex-1 bg-transparent py-2.5 text-[12px] text-white placeholder-neutral-600 focus:outline-none"
                />
                {modelsLoading && <Spinner size={13} className="text-cyan-400" />}
              </div>
              <div className="max-h-44 overflow-y-auto p-1.5">
                {models.length === 0 && !modelsLoading && (
                  <p className="px-3 py-4 text-center font-mono text-[10px] leading-relaxed text-neutral-600">
                    {modelsError ?? 'Paste a key to load models, or type a model id.'}
                  </p>
                )}
                {filteredModels.map((item) => {
                  const active = item.id === model;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setModel(item.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors ${
                        active ? 'bg-cyan-500/15 text-white' : 'text-neutral-400 hover:bg-white/[0.05] hover:text-neutral-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-cyan-400' : 'bg-neutral-700'}`} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{item.id}</span>
                      {item.free && (
                        <span className="shrink-0 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider text-emerald-300">
                          free
                        </span>
                      )}
                      {!!item.contextLength && (
                        <span className="shrink-0 font-mono text-[9px] text-neutral-600">
                          {Math.round(item.contextLength / 1000)}k
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3.5 py-3 text-[12px] leading-relaxed text-red-300">
            <IconWarn size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {status?.ok && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-3.5 py-3 text-[12px] text-emerald-300">
            <IconCheck size={15} className="mt-0.5 shrink-0" />
            <span>
              Linked to {status.label} — {status.detail}
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="primary"
            size="lg"
            full
            loading={busy}
            disabled={!canSubmit}
            onClick={handleConnect}
            icon={saved ? <IconCheck size={16} /> : undefined}
          >
            {busy ? 'Verifying' : saved ? 'Connected' : mode === 'connect' ? 'Establish link' : 'Save connection'}
          </Button>
          {mode === 'settings' && (
            <Button variant="ghost" size="lg" onClick={onClose} className="sm:w-auto">
              Done
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {hostKey && !storedKey ? (
            <button
              onClick={useHostKey}
              className="font-mono text-[9px] uppercase tracking-[0.14em] text-emerald-400 hover:text-emerald-300"
            >
              Use deployment key
            </button>
          ) : (
            <span />
          )}
          {storedKey && (
            <button
              onClick={disconnect}
              className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600 hover:text-red-400"
            >
              <IconTrash size={12} /> forget key
            </button>
          )}
        </div>
      </div>
    </div>
  );

  if (mode === 'settings') return body;

  return (
    <div className="fixed inset-0 z-[150] overflow-y-auto bg-[#050505] safe-top safe-bottom">
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-[-10%] top-[-15%] h-[50vw] w-[50vw] rounded-full bg-cyan-900/10 blur-[160px]" />
        <div className="absolute bottom-[-15%] right-[-10%] h-[60vw] w-[60vw] rounded-full bg-violet-900/10 blur-[180px]" />
        <div className="noise-overlay absolute inset-0 opacity-[0.05] mix-blend-overlay" />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-xl flex-col justify-center px-4 py-8 sm:py-12">
        <div className="mb-7 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300 shadow-glow">
            <span className="font-display text-lg font-bold">D</span>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Connect a model
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-balance text-[13px] leading-relaxed text-neutral-400">
            Duet runs on your own key. Bring OpenRouter, Google Gemini, NVIDIA NIM — or any
            OpenAI-compatible endpoint. Keys stay in this browser.
          </p>
        </div>

        <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0a0a0a]/90 shadow-3xl backdrop-blur-2xl">
          {body}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-600">
          <span className="inline-flex items-center gap-1.5">
            <IconShield size={12} /> keys never leave the browser
          </span>
          <span className="inline-flex items-center gap-1.5">
            <IconGlobe size={12} /> no server, no account
          </span>
        </div>
      </div>
    </div>
  );
};
