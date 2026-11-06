import React, { useState } from 'react';
import { GroundingSource, UserProfile } from '../types';
import { analyzeIdentity, generateAvatar, searchUserBio } from '../services/duet';
import { PROVIDERS, useLlmConfig } from '../services/llm';
import { ACCENT_CLASSES } from '../services/llm/providers';
import { Button, Field, Spinner, inputClass } from './ui';
import { IconArrowLeft, IconFile, IconGlobe, IconSearch, IconShield, IconSpark, IconWarn } from './icons';

interface OnboardingProps {
  onComplete: (profile: UserProfile) => void;
  onOpenSettings?: () => void;
  onOpenProtocol?: () => void;
}

type Mode = 'manual' | 'search';

const EXAMPLES: Array<{ name: string; mode: Mode; topic?: string }> = [
  { name: 'Socrates', mode: 'search' },
  { name: 'Ada Lovelace', mode: 'search' },
  { name: 'Naval Ravikant', mode: 'search' },
  { name: 'My future self in 2040', mode: 'manual' },
];

const PROGRESS_STEPS = [
  'Mapping the ideological landscape…',
  'Extracting perception filters…',
  'Synthesising the cognitive avatar…',
];

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete, onOpenSettings, onOpenProtocol }) => {
  const config = useLlmConfig();
  const meta = PROVIDERS[config.provider];
  const accent = ACCENT_CLASSES[meta.accent];

  const [mode, setMode] = useState<Mode>('manual');
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [links, setLinks] = useState('');
  const [topic, setTopic] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<GroundingSource[]>([]);

  const handleSearch = async () => {
    if (!name.trim() || isSearching) return;
    setIsSearching(true);
    setError(null);
    setSources([]);
    try {
      const result = await searchUserBio(name.trim());
      setBio(result.bio);
      setSources(result.sources ?? []);
      if (!result.bio.trim()) {
        setError('No usable profile came back. Write the worldview yourself instead.');
        setMode('manual');
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? `Lookup failed: ${err.message}`
          : 'Lookup failed. Check your connection in Settings.'
      );
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !bio.trim() || isBuilding) return;

    setIsBuilding(true);
    setError(null);
    setStep(0);

    try {
      setStep(1);
      const profile = await analyzeIdentity(name.trim(), bio.trim(), links.trim());
      setStep(2);
      const avatarUrl = await generateAvatar(name.trim(), profile);
      onComplete({
        name: name.trim(),
        bio: profile || bio.trim(),
        links: links.trim(),
        source: mode,
        topic: topic.trim() || undefined,
        avatarUrl,
      });
    } catch (err) {
      // A failed profile pass should not block the session — fall back to raw bio.
      if (!bio.trim()) {
        setError(err instanceof Error ? err.message : 'Could not build the profile.');
        setIsBuilding(false);
        return;
      }
      onComplete({
        name: name.trim(),
        bio: bio.trim(),
        links: links.trim(),
        source: mode,
        topic: topic.trim() || undefined,
      });
    } finally {
      setIsBuilding(false);
      setStep(0);
    }
  };

  const applyExample = (example: (typeof EXAMPLES)[number]) => {
    setMode(example.mode);
    setName(example.name);
    setBio('');
    setSources([]);
    setError(null);
    if (example.mode === 'manual' && example.name === 'My future self in 2040') {
      setName('Future Self');
      setBio(
        'A version of me twenty years ahead: calmer, more selective about what deserves attention, allergic to urgency, financially free, and deeply invested in craft over status. Speaks plainly, refuses hype, and treats rest as part of the work.'
      );
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl animate-fade-in-up px-1 py-4">
      {/* Hero */}
      <div className="mb-7 text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-400">
            {meta.name}
          </span>
          <span className="max-w-[140px] truncate font-mono text-[9px] text-neutral-600">{config.model}</span>
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="ml-1 font-mono text-[9px] uppercase tracking-[0.14em] text-cyan-400 hover:text-cyan-300"
            >
              change
            </button>
          )}
          {onOpenProtocol && (
            <button
              onClick={onOpenProtocol}
              className="ml-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500 hover:text-neutral-200"
              title="Operating protocol"
            >
              <IconShield size={10} /> protocol
            </button>
          )}
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-[2.6rem] sm:leading-[1.1]">
          Build a parallel consciousness
        </h1>
        <p className="mx-auto mt-3 max-w-md text-balance text-[13px] leading-relaxed text-neutral-400 sm:text-sm">
          Give Duet a person — a public figure, a mentor, a future version of yourself. It reconstructs
          how they see the world, then argues with you from inside that worldview.
        </p>
      </div>

      {/* Card */}
      <form
        onSubmit={handleSubmit}
        className="rounded-[1.75rem] border border-white/10 bg-[#0a0a0a]/85 p-5 shadow-3xl backdrop-blur-xl sm:p-7"
      >
        {/* Mode switch */}
        <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-2xl border border-white/[0.06] bg-black/40 p-1.5">
          {(['manual', 'search'] as Mode[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setMode(value);
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-all ${
                mode === value
                  ? 'bg-white/[0.09] text-white shadow-inner'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {value === 'manual' ? <IconSpark size={13} /> : <IconSearch size={13} />}
              {value === 'manual' ? 'I describe them' : 'Look them up'}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <Field
            label="Subject"
            hint={
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600">
                {mode === 'search' ? 'public figure or person' : 'name of the persona'}
              </span>
            }
          >
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={mode === 'search' ? 'e.g. Hannah Arendt' : 'e.g. My mentor Ravi'}
                className={inputClass}
                autoComplete="off"
              />
              {mode === 'search' && (
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleSearch}
                  loading={isSearching}
                  disabled={!name.trim()}
                  className="shrink-0"
                >
                  {isSearching ? 'Reading' : 'Look up'}
                </Button>
              )}
            </div>
          </Field>

          {mode === 'search' && sources.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-500">
                Grounded in
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.slice(0, 5).map((source) => (
                  <a
                    key={source.uri}
                    href={source.uri}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[220px] truncate rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-neutral-400 hover:border-cyan-500/40 hover:text-cyan-300"
                  >
                    {source.title}
                  </a>
                ))}
              </div>
            </div>
          )}

          <Field
            label="Worldview"
            hint={
              <span className="font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600">
                {bio.length}/4000
              </span>
            }
          >
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value.slice(0, 4000))}
              placeholder="What do they believe? What do they notice first? What do they refuse to say? The sharper the material, the sharper the clone."
              className={`${inputClass} h-36 resize-none leading-relaxed`}
              readOnly={isSearching}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Reference links" hint={<span className="font-mono text-[9px] text-neutral-600">optional</span>}>
              <input
                value={links}
                onChange={(event) => setLinks(event.target.value)}
                placeholder="essays, talks, threads"
                className={inputClass}
              />
            </Field>
            <Field label="Session topic" hint={<span className="font-mono text-[9px] text-neutral-600">optional</span>}>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="what you want to discuss"
                className={inputClass}
              />
            </Field>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-3.5 py-3 text-[12px] leading-relaxed text-red-300">
            <IconWarn size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          full
          className="mt-6"
          loading={isBuilding}
          disabled={!name.trim() || !bio.trim()}
          icon={!isBuilding ? <IconArrowLeft size={16} className="rotate-180" /> : undefined}
        >
          {isBuilding ? PROGRESS_STEPS[Math.max(0, step - 1)] : 'Enter the duet'}
        </Button>

        {isBuilding && (
          <div className="mt-4 space-y-2">
            {PROGRESS_STEPS.map((label, index) => (
              <div key={label} className="flex items-center gap-2.5">
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border text-[8px] ${
                    index + 1 < step
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : index + 1 === step
                        ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-300'
                        : 'border-white/10 text-neutral-700'
                  }`}
                >
                  {index + 1 < step ? '✓' : index + 1 === step ? <Spinner size={9} /> : index + 1}
                </span>
                <span
                  className={`font-mono text-[10px] tracking-wide ${
                    index + 1 <= step ? 'text-neutral-300' : 'text-neutral-700'
                  }`}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}
      </form>

      {/* Examples */}
      {!isBuilding && (
        <div className="mt-5">
          <p className="mb-2 text-center font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-600">
            or start from
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {EXAMPLES.map((example) => (
              <button
                key={example.name}
                type="button"
                onClick={() => applyExample(example)}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 text-[11px] text-neutral-400 transition-colors hover:border-cyan-500/30 hover:text-cyan-300"
              >
                {example.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-700">
        <span className="inline-flex items-center gap-1.5">
          <IconShield size={11} /> profile stays on this device
        </span>
        <span className="inline-flex items-center gap-1.5">
          <IconGlobe size={11} /> {meta.short.toLowerCase()} · {config.model.split('/').pop()}
        </span>
        <a
          href="https://doi.org/10.5281/zenodo.23831022"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan-400"
          title="Duet: Agentic AI and the Construction of Parallel Consciousness"
        >
          <IconFile size={11} /> paper · doi
        </a>
      </div>
    </div>
  );
};
