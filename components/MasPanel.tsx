import React, { useState } from 'react';
import type { MasState, PiSection } from '../types';
import {
  addPiField,
  JATAKA_SUMMARY,
  MAS_MODES,
  piUrl,
  removePiField,
  resetMasLogs,
  setMasEnabled,
  setMasMode,
  setPiConsent,
} from '../services/mas';
import { downloadFile } from '../services/session';
import { PERSONAFORGE_COMMAND, PERSONAFORGE_PRINCIPLES } from '../services/personaforge';
import { Badge, Button, Field, inputClass } from './ui';
import { IconCheck, IconDownload, IconShield, IconSpark, IconTrash, IconWarn } from './icons';

interface MasPanelProps {
  state: MasState;
  onChange: (next: MasState) => void;
}

const SECTIONS: PiSection[] = ['identity', 'persona', 'context', 'history', 'preferences'];

const TABS = [
  { id: 'state', label: 'Protocol' },
  { id: 'dunce', label: 'Dunce' },
  { id: 'audit', label: 'Audit' },
] as const;

type Tab = (typeof TABS)[number]['id'];

function time(value: number): string {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export const MasPanel: React.FC<MasPanelProps> = ({ state, onChange }) => {
  const [tab, setTab] = useState<Tab>('state');
  const [section, setSection] = useState<PiSection>('persona');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const mode = MAS_MODES.find((entry) => entry.id === state.mode);

  const add = () => {
    if (!draft.trim()) return;
    onChange(addPiField(state, section, draft));
    setDraft('');
    setStatus('PI field written and audited.');
  };

  const remove = (id: string) => {
    onChange(removePiField(state, id));
    setStatus('PI field deleted and audited.');
  };

  const exportLog = () => {
    downloadFile(
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          mode: state.mode,
          stage: state.stage,
          enabled: state.enabled,
          piConsent: state.piConsent,
          piFields: state.piFields.map((field) => ({ ...field, url: piUrl(field) })),
          dunce: state.dunce,
          audit: state.audit,
        },
        null,
        2
      ),
      `duet-protocol-${Date.now()}.json`,
      'application/json'
    );
  };

  return (
    <div className="flex max-h-[82vh] flex-col">
      <div className="border-b border-white/[0.06] px-5 py-4 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/[0.08] text-cyan-300">
            <IconShield size={18} />
          </div>
          <div className="min-w-0">
            <h2 id="protocol-title" className="font-display text-lg font-semibold tracking-tight text-white">
              Operating protocol
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
              Six Hats · EMOJA · PERSONAFORGE · DUNCE · KUNDALINI · JATAKA. Policy is prompt-level; the
              checks below are computed locally from each reply.
            </p>
          </div>
          <div className="ml-auto hidden shrink-0 sm:block">
            <Badge tone={state.enabled ? 'green' : 'neutral'}>
              {state.enabled ? 'layer on' : 'bypassed'}
            </Badge>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-7">
        {/* Master switch + stage */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onChange(setMasEnabled(state, !state.enabled))}
            className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
              state.enabled
                ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300'
                : 'border-white/10 bg-white/[0.03] text-neutral-500'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${state.enabled ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
            {state.enabled ? 'protocol active' : 'protocol bypassed'}
          </button>
          <Badge tone={state.stage === 2 ? 'amber' : state.stage === 1 ? 'cyan' : 'neutral'}>
            kundalini stage {state.stage}
          </Badge>
          <Badge tone={state.piConsent ? 'green' : 'neutral'}>
            {state.piConsent ? 'PI consent on' : 'PI disabled'}
          </Badge>
          <button
            onClick={exportLog}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400 hover:border-white/20 hover:text-white"
          >
            <IconDownload size={12} /> export
          </button>
        </div>

        {!state.enabled && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200/80">
            <IconWarn size={14} className="mt-0.5 shrink-0" />
            The layer is bypassed. Replies are generated without MAS prompt text or guard evaluation.
          </div>
        )}

        {/* Tabs */}
        <div className="mt-4 flex gap-1 border-b border-white/[0.06]">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              onClick={() => setTab(entry.id)}
              className={`relative px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.18em] transition-colors ${
                tab === entry.id ? 'text-cyan-300' : 'text-neutral-600 hover:text-neutral-300'
              }`}
            >
              {entry.label}
              {tab === entry.id && <span className="absolute inset-x-2 -bottom-px h-px bg-cyan-400" />}
            </button>
          ))}
        </div>

        {tab === 'state' && (
          <div className="mt-4 space-y-5">
            <Field label="Mode">
              <div className="grid gap-1.5 sm:grid-cols-2">
                {MAS_MODES.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => onChange(setMasMode(state, entry.id))}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                      state.mode === entry.id
                        ? 'border-cyan-500/35 bg-cyan-500/[0.07]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/15'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          state.mode === entry.id ? 'bg-cyan-400' : 'bg-neutral-700'
                        }`}
                      />
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-200">
                        {entry.label}
                      </span>
                    </span>
                    <span className="mt-1 block text-[10.5px] leading-relaxed text-neutral-500">
                      {entry.note}
                    </span>
                  </button>
                ))}
              </div>
              {mode && (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-600">
                  active · {mode.id}
                </p>
              )}
            </Field>

            <Field label="PI consent">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onChange(setPiConsent(state, !state.piConsent))}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] ${
                      state.piConsent
                        ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300'
                        : 'border-white/10 bg-black/40 text-neutral-400'
                    }`}
                  >
                    {state.piConsent ? <IconCheck size={12} /> : <IconWarn size={12} />}
                    {state.piConsent ? 'consent granted' : 'grant consent'}
                  </button>
                  <span className="text-[11px] leading-relaxed text-neutral-500">
                    {state.piConsent
                      ? 'Approved fields below are used for tone only, never as factual proof.'
                      : 'PI: DISABLED — no personal context used.'}
                  </span>
                </div>

                {state.piConsent && (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <div className="flex flex-col gap-1.5 sm:flex-row">
                      <select
                        value={section}
                        onChange={(event) => setSection(event.target.value as PiSection)}
                        className="rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 font-mono text-[10px] uppercase tracking-[0.12em] text-neutral-300 focus:border-cyan-500/60 focus:outline-none"
                      >
                        {SECTIONS.map((entry) => (
                          <option key={entry} value={entry}>
                            {entry}
                          </option>
                        ))}
                      </select>
                      <input
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            add();
                          }
                        }}
                        placeholder="A fact you explicitly approve for tone…"
                        className={`${inputClass} py-2`}
                      />
                      <button
                        onClick={add}
                        disabled={!draft.trim()}
                        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-cyan-300 disabled:opacity-30"
                      >
                        <IconSpark size={12} /> add
                      </button>
                    </div>

                    {state.piFields.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        {state.piFields.map((field) => (
                          <div
                            key={field.id}
                            className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2"
                          >
                            <Badge tone="violet">{field.section}</Badge>
                            <span className="min-w-0 flex-1 truncate text-[11px] text-neutral-300">
                              {field.value}
                            </span>
                            <button
                              onClick={() => remove(field.id)}
                              aria-label="Delete PI field"
                              className="shrink-0 text-neutral-600 hover:text-red-400"
                            >
                              <IconTrash size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-700">
                        no approved PI fields
                      </p>
                    )}
                    {status && <p className="mt-2 text-[10.5px] text-emerald-400/80">{status}</p>}
                  </div>
                )}
              </div>
            </Field>

            <Field label="Jataka guards">
              <div className="space-y-1">
                {JATAKA_SUMMARY.map((guard) => (
                  <div
                    key={guard.id}
                    className="flex gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-[9px] text-cyan-400/70">{guard.id}</span>
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-400">
                        {guard.name}
                      </p>
                      <p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-500">{guard.rule}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">
                G2 escalates to a human gate; it does not execute. Stage 2 asks for explicit approval before
                any consequential action is proposed as done.
              </p>
            </Field>

            <Field label="PERSONAFORGE command">
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.04] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-violet-300">
                    {PERSONAFORGE_COMMAND.usage}
                  </span>
                  <span className="text-[11px] leading-relaxed text-neutral-500">
                    typed in the composer, one URL at a time
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
                  {PERSONAFORGE_COMMAND.description} It fetches the page, extracts the cast, and interviews
                  you one persona at a time. The command runs beside EMOJA and JATAKA, not instead of them.
                </p>
                <div className="mt-2.5 space-y-1">
                  {PERSONAFORGE_PRINCIPLES.map((principle) => (
                    <div
                      key={principle.id}
                      className="flex gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] px-3 py-2"
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-[9px] text-violet-300/70">
                        {principle.id}
                      </span>
                      <div className="min-w-0">
                        <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-400">
                          {principle.name}
                        </p>
                        <p className="mt-0.5 text-[10.5px] leading-relaxed text-neutral-500">
                          {principle.rule}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10.5px] leading-relaxed text-neutral-600">
                  Type <span className="text-violet-300/80">/forge exit</span> to return to the persona’s
                  normal voice. The command checks one-question discipline, meta leaks, and unsourced
                  credentials; those checks are heuristics, not a firewall.
                </p>
              </div>
            </Field>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
              <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">Honest status</p>
              <ul className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed text-neutral-500">
                <li>kb://, pi:// and jataka:// are address conventions, not a persistent database.</li>
                <li>This client has no live crawler; SITEMAP and INDEX are declared modes only.</li>
                <li>No server-side PI. Everything lives in this browser and can be exported or reset.</li>
                <li>Guards are policy instructions, not a hard enforcement firewall.</li>
                <li>/forge fetches through r.jina.ai; if the reader fails, the command marks unknowns instead of inventing them.</li>
              </ul>
            </div>

            <div className="flex justify-end border-t border-white/[0.06] pt-3">
              <Button
                variant="danger"
                size="sm"
                icon={<IconTrash size={13} />}
                onClick={() => {
                  if (confirm('Clear the DUNCE log, audit log, and Kundalini stage? PI fields stay.')) {
                    onChange(resetMasLogs(state));
                    setStatus('Logs and stage reset.');
                  }
                }}
              >
                reset logs &amp; stage
              </Button>
            </div>
          </div>
        )}

        {tab === 'dunce' && (
          <div className="mt-4">
            <p className="mb-3 text-[11px] leading-relaxed text-neutral-500">
              Error, correction, confidence delta, KB/PI addresses and JATAKA precedents. Newest first.
            </p>
            {state.dunce.length === 0 ? (
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700">
                nothing logged yet
              </p>
            ) : (
              <div className="space-y-1.5">
                {[...state.dunce].reverse().map((entry) => (
                  <div
                    key={entry.id}
                    className={`rounded-xl border px-3 py-2.5 ${
                      entry.kind === 'error'
                        ? 'border-red-500/20 bg-red-500/[0.04]'
                        : entry.jataka?.length
                          ? 'border-amber-500/20 bg-amber-500/[0.04]'
                          : 'border-white/[0.06] bg-white/[0.02]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-600">
                        {entry.kind}
                      </span>
                      <span className="font-mono text-[8.5px] text-neutral-700">{time(entry.at)}</span>
                      {typeof entry.confidenceDelta === 'number' && (
                        <span
                          className={`ml-auto font-mono text-[9px] ${
                            entry.confidenceDelta < 0 ? 'text-red-400/80' : 'text-emerald-400/80'
                          }`}
                        >
                          {entry.confidenceDelta > 0 ? '+' : ''}
                          {entry.confidenceDelta.toFixed(2)}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-neutral-300">{entry.summary}</p>
                    {entry.correction && (
                      <p className="mt-1 text-[10.5px] leading-relaxed text-neutral-500">{entry.correction}</p>
                    )}
                    {(entry.kbUrls?.length || entry.piUrls?.length) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {entry.kbUrls?.map((url) => (
                          <span
                            key={url}
                            className="rounded border border-cyan-500/20 bg-cyan-500/[0.05] px-1.5 py-0.5 font-mono text-[8px] text-cyan-300/70"
                          >
                            {url}
                          </span>
                        ))}
                        {entry.piUrls?.map((url) => (
                          <span
                            key={url}
                            className="rounded border border-violet-500/20 bg-violet-500/[0.05] px-1.5 py-0.5 font-mono text-[8px] text-violet-300/70"
                          >
                            {url}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="mt-4">
            <p className="mb-3 text-[11px] leading-relaxed text-neutral-500">
              Every PI read, write, delete or consent change is recorded with a purpose.
            </p>
            {state.audit.length === 0 ? (
              <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-6 text-center font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-700">
                no PI events
              </p>
            ) : (
              <div className="space-y-1">
                {[...state.audit].reverse().map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-2 rounded-lg border border-white/[0.05] bg-white/[0.015] px-2.5 py-2"
                  >
                    <span className="shrink-0 font-mono text-[8.5px] uppercase tracking-[0.14em] text-cyan-400/60">
                      {entry.action}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-mono text-[9px] text-neutral-400">{entry.field}</span>
                      <span className="block text-[10.5px] leading-relaxed text-neutral-600">{entry.purpose}</span>
                    </span>
                    <span className="shrink-0 font-mono text-[8px] text-neutral-700">{time(entry.at)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
