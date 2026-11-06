/// The MAS operating layer: KUNDALINI (Blue Hat), EMOJA (tone), DUNCE
/// (failure memory) and the JATAKA guardrails. Everything here is deterministic
/// and local — the model receives the policy as prompt text, while the checks
/// below are computed from the reply the model actually returned.

import type {
  AuditEntry,
  ContextNode,
  DunceEntry,
  GuardCheck,
  GuardId,
  GovernorTrace,
  MasMode,
  MasStage,
  MasState,
  PiField,
  PiSection,
  UserProfile,
} from '../types';

const STORAGE_KEY = 'duet.mas.v1';
const MAX_AUDIT = 80;
const MAX_DUNCE = 80;

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

export const MAS_MODES: Array<{ id: MasMode; label: string; note: string }> = [
  { id: 'SINGLE', label: 'Single', note: 'Answer the turn normally, grounded in the KB when it helps.' },
  {
    id: 'KB-PRIMARY',
    label: 'KB primary',
    note: 'The KB is the only permitted source. No entry on point means KB_MISS and a stop.',
  },
  {
    id: 'REFRESH',
    label: 'Refresh',
    note: 'Propose a correction with evidence and wait for ACCEPT before writing back.',
  },
  {
    id: 'SITEMAP',
    label: 'Sitemap',
    note: 'Declared only — this client has no live crawler, so URL lists are never claimed as fetched.',
  },
  {
    id: 'INDEX',
    label: 'Index',
    note: 'Declared only — index the injected KB, never invent pages that were not provided.',
  },
];

export const JATAKA_SUMMARY: Array<{ id: GuardId; name: string; rule: string }> = [
  { id: 'G1', name: 'Intention', rule: 'State the intent before acting; do not substitute an action the user did not ask for.' },
  { id: 'G2', name: 'Non-harm', rule: 'High-impact actions need explicit approval and a stated mitigation.' },
  { id: 'G3', name: 'Truthful speech', rule: 'A claim may not exceed its evidence tier; downgrade or omit.' },
  { id: 'G4', name: 'Non-attachment', rule: 'Do not shape the answer to please. KB_MISS and CONFLICT are valid outcomes.' },
  { id: 'G5', name: 'Right relationship', rule: 'Persona mode never puts unauthorized words in the user’s mouth; PI requires consent.' },
  { id: 'G6', name: 'Consequence memory', rule: 'Every trigger is written to DUNCE; repeats tighten the stage.' },
];

export const DEFAULT_MAS: MasState = {
  enabled: true,
  piConsent: false,
  mode: 'SINGLE',
  stage: 0,
  piFields: [],
  audit: [],
  dunce: [],
  updatedAt: 0,
};

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

function makeId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampStage(stage: unknown): MasStage {
  return stage === 2 ? 2 : stage === 1 ? 1 : 0;
}

export function loadMasState(): MasState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_MAS };
    const parsed = JSON.parse(raw) as Partial<MasState>;
    return {
      enabled: parsed.enabled !== false,
      piConsent: parsed.piConsent === true,
      mode: MAS_MODES.some((mode) => mode.id === parsed.mode) ? (parsed.mode as MasMode) : 'SINGLE',
      stage: clampStage(parsed.stage),
      piFields: Array.isArray(parsed.piFields) ? parsed.piFields : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit.slice(-MAX_AUDIT) : [],
      dunce: Array.isArray(parsed.dunce) ? parsed.dunce.slice(-MAX_DUNCE) : [],
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return { ...DEFAULT_MAS };
  }
}

export function saveMasState(state: MasState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // Private mode or quota — the protocol still runs for this tab.
  }
}

function touch(state: MasState, patch: Partial<MasState>): MasState {
  return { ...state, ...patch, updatedAt: Date.now() };
}

/* -------------------------------------------------------------------------- */
/* State transitions                                                          */
/* -------------------------------------------------------------------------- */

export function setMasEnabled(state: MasState, enabled: boolean): MasState {
  const audit: AuditEntry[] = [
    ...state.audit,
    {
      id: makeId('audit'),
      at: Date.now(),
      action: (enabled ? 'enable' : 'disable') as AuditEntry['action'],
      field: 'protocol',
      purpose: 'user toggled the MAS operating layer',
    },
  ].slice(-MAX_AUDIT);
  return touch(state, { enabled, audit });
}

export function setMasMode(state: MasState, mode: MasMode): MasState {
  return touch(state, { mode });
}

export function setPiConsent(state: MasState, piConsent: boolean): MasState {
  const audit: AuditEntry[] = [
    ...state.audit,
    {
      id: makeId('audit'),
      at: Date.now(),
      action: (piConsent ? 'enable' : 'disable') as AuditEntry['action'],
      field: 'pi-consent',
      purpose: piConsent ? 'user granted PI consent' : 'user revoked PI consent',
    },
  ].slice(-MAX_AUDIT);
  return touch(state, { piConsent, audit });
}

export function addPiField(state: MasState, section: PiSection, value: string): MasState {
  const clean = value.trim();
  if (!clean) return state;
  const field: PiField = { id: makeId('pi'), section, value: clean, approvedAt: Date.now() };
  const audit: AuditEntry[] = [
    ...state.audit,
    {
      id: makeId('audit'),
      at: Date.now(),
      action: 'write' as const,
      field: piUrl(field),
      purpose: 'user added an approved PI field',
    },
  ].slice(-MAX_AUDIT);
  return touch(state, { piFields: [...state.piFields, field], audit });
}

export function removePiField(state: MasState, fieldId: string): MasState {
  const field = state.piFields.find((item) => item.id === fieldId);
  if (!field) return state;
  const audit: AuditEntry[] = [
    ...state.audit,
    {
      id: makeId('audit'),
      at: Date.now(),
      action: 'delete' as const,
      field: piUrl(field),
      purpose: 'user deleted a PI field',
    },
  ].slice(-MAX_AUDIT);
  return touch(state, { piFields: state.piFields.filter((item) => item.id !== fieldId), audit });
}

export function resetMasLogs(state: MasState): MasState {
  return touch(state, { stage: 0, dunce: [], audit: [] });
}

function escalateStage(state: MasState, trace: GovernorTrace): MasStage {
  const failures = trace.checks.filter((check) => check.status !== 'PASS' && check.status !== 'LOGGED');
  if (!failures.length) return state.stage;
  // A repeat of the same guard in the last three logged turns escalates to 2.
  const recent = state.dunce.slice(-2).filter((entry) => entry.kind === 'turn');
  const repeated = failures.some((failure) =>
    recent.some((entry) => entry.jataka?.includes(failure.id))
  );
  if (repeated) return 2;
  return state.stage < 1 ? 1 : state.stage;
}

export function recordTurn(state: MasState, trace: GovernorTrace): MasState {
  const failures = trace.checks.filter((check) => check.status !== 'PASS' && check.status !== 'LOGGED');
  const entry: DunceEntry = {
    id: makeId('dunce'),
    at: trace.at,
    kind: 'turn',
    summary: `${trace.mode} → ${trace.verdict} · ${trace.risk} risk · grounded ${trace.grounded}`,
    correction: failures.length
      ? failures.map((failure) => `${failure.id} ${failure.status}: ${failure.note}`).join(' ')
      : undefined,
    confidenceDelta: failures.length ? -0.05 * failures.length : 0.02,
    kbUrls: trace.kbUrls,
    piUrls: trace.piUrls,
    jataka: failures.map((failure) => failure.id),
  };

  const audit =
    state.piConsent && state.piFields.length
      ? [
          ...state.audit,
          {
            id: makeId('audit'),
            at: trace.at,
            action: 'read' as const,
            field: `${state.piFields.length} approved field(s)`,
            purpose: `${trace.mode} turn · tone/persona framing only`,
          },
        ].slice(-MAX_AUDIT)
      : state.audit;

  return touch(state, {
    stage: escalateStage(state, trace),
    dunce: [...state.dunce, entry].slice(-MAX_DUNCE),
    audit,
  });
}

export function recordError(state: MasState, message: string): MasState {
  const entry: DunceEntry = {
    id: makeId('dunce'),
    at: Date.now(),
    kind: 'error',
    summary: message.slice(0, 240),
    confidenceDelta: -0.1,
    kbUrls: [],
    piUrls: [],
  };
  return touch(state, { dunce: [...state.dunce, entry].slice(-MAX_DUNCE) });
}

/* -------------------------------------------------------------------------- */
/* KB / PI addresses                                                          */
/* -------------------------------------------------------------------------- */

export interface KbEntry {
  url: string;
  title: string;
  tier: 'FETCHED' | 'DECLARED' | 'UNRESOLVED';
  source?: string;
  nodeId: string;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 60) || 'entry'
  );
}

function hash8(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hostFor(node: ContextNode): string {
  const candidate = node.sourceUrl ?? (node.type === 'link' ? node.content : '');
  try {
    return new URL(candidate).hostname || 'local.kb';
  } catch {
    return node.type === 'link' ? 'link.kb' : 'local.kb';
  }
}

export function kbUrlFor(node: ContextNode): string {
  const slug = slugify(node.title);
  const id = hash8(`${node.title}::${node.content.slice(0, 4000)}`);
  return `kb://${hostFor(node)}/${slug}?id=${id}&v=1`;
}

export function buildKbEntries(nodes: ContextNode[] | undefined): KbEntry[] {
  if (!nodes?.length) return [];
  return nodes
    .filter((node) => node.status === 'ready')
    .map((node) => ({
      url: kbUrlFor(node),
      title: node.title,
      tier: node.type === 'link' ? 'FETCHED' : 'DECLARED',
      source: node.sourceUrl,
      nodeId: node.id,
    }));
}

export function piUrl(field: PiField): string {
  return `pi://local/${field.section}/${field.id}?v=1`;
}

/* -------------------------------------------------------------------------- */
/* Prompt construction                                                        */
/* -------------------------------------------------------------------------- */

function dunceRecall(state: MasState): string {
  const recent = state.dunce
    .filter((entry) => entry.kind !== 'turn' || entry.correction)
    .slice(-5)
    .map((entry) => `- ${entry.summary}${entry.correction ? ` → ${entry.correction}` : ''}`);
  return recent.length ? recent.join('\n') : '- No failures logged yet.';
}

function kbBlock(entries: KbEntry[]): string {
  if (!entries.length) {
    return 'GROUNDED: NONE\nNo KB entry is available. Treat factual claims as [unverified], or return KB_MISS when the mode requires a source.';
  }
  return entries
    .map(
      (entry) =>
        `- ${entry.url} · ${entry.tier} · ${entry.title}${entry.source ? ` (source: ${entry.source})` : ''}`
    )
    .join('\n');
}

export function buildMasPrompt(
  state: MasState | undefined,
  profile: UserProfile,
  nodes: ContextNode[] | undefined
): string {
  if (!state?.enabled) return '';

  const entries = buildKbEntries(nodes);
  const piFields = state.piConsent ? state.piFields : [];
  const piBlock = state.piConsent
    ? piFields.length
      ? piFields.map((field) => `- ${piUrl(field)} · ${field.section} · ${field.value}`).join('\n') +
        '\nPI frames tone and tailoring only. It is never cited as factual proof.'
      : '- Consent is ON but no PI field is stored. Do not invent personal context.'
    : 'PI: DISABLED — no personal context used.';

  return `OPERATING PROTOCOL — MAS (Six Hats, EMOJA, DUNCE, KUNDALINI, JATAKA)
You are one coordinated system. KUNDALINI owns the Blue Hat agenda. EMOJA owns tone and the Red Hat. DUNCE owns failure memory. JATAKA owns precedent guardrails. No component speaks outside its role.

KUNDALINI / BLUE HAT
- MODE: ${state.mode}. STAGE: ${state.stage}.
- Stage 0: normal. Stage 1: cite a KB entry for every factual claim. Stage 2: any MEDIUM-or-higher risk action needs explicit approval before it is proposed as done.
- Stage escalation is driven by repeated JATAKA failures in the DUNCE log.
- PERSONA SUBJECT: ${profile.name}. The subject is not the user.

SIX HATS — run internally in this order, then resolve them in [[META]]; do not print each hat as its own heading.
1. BLUE (KUNDALINI) — agenda, mode, crawl scope, stage, PI consent.
2. WHITE — facts from the KB only; cite kb:// addresses. PI frames, never proves.
3. YELLOW (EMOJA tone, PI-aware) — benefits and what the persona would value.
4. BLACK (DUNCE-informed) — risks; cite a failure or KB entry; flag PI overreach.
5. GREEN — alternatives, tailored by PI context only when consent is on.
6. RED (EMOJA) — tone and trust check against the persona.
7. BLUE (KUNDALINI) — synthesis, risk rating, approval gate.

KB ENTRIES (this session)
${kbBlock(entries)}

PI (consent-gated)
${piBlock}

DUNCE — retrieved failures to avoid
${dunceRecall(state)}

JATAKA GUARDRAILS — check before any HIGH-RISK action, any persona statement about the user, or any KB write-back:
G1 INTENTION: state the intent; never substitute an action the user did not request.
G2 NON-HARM: deleting data, publishing claims, executing code, speaking for someone, or spending money requires explicit approval plus stated mitigation. Escalate instead of acting.
G3 TRUTHFUL SPEECH: no claim may exceed its tier. SELF-REPORTED and DECLARED may not be spoken as FETCHED. Absence of evidence is not evidence of absence.
G4 NON-ATTACHMENT: do not optimize for looking successful. KB_MISS and CONFLICT are valid successes. A shorter honest answer beats a longer confident one.
G5 RIGHT RELATIONSHIP: in persona mode, speak as the person, never overclaim for them. Never put unauthorized words in the user's mouth.
G6 CONSEQUENCE MEMORY: guard triggers are recorded in DUNCE; repeats tighten the stage.

MODE RULES
- SINGLE: answer normally; ground factual claims in the KB where possible.
- KB-PRIMARY: the KB is the sole permitted source. If no entry supports the answer, emit [[KB_MISS]] and stop. Do not fill gaps with general knowledge.
- REFRESH: mark the disputed claim, show independent evidence, propose a version bump, and wait for ACCEPT. Never delete a version.
- SITEMAP / INDEX: this client has no live crawler. Never claim a crawl happened. Any URL list is DECLARED unless it came from the KB, and depth stays at the provided material.

OUTPUT
Keep Duet's [[PRIMARY]], [[META]], [[RESPONSE]] structure. [[META]] is where the hats resolve. After [[RESPONSE]], emit one compact block:
[[GOVERNOR]]
MODE: ${state.mode}
GROUNDED: YES | PARTIAL | NO
RISK: LOW | MEDIUM | HIGH
VERDICT: PROCEED | HALT | ESCALATE
[[/GOVERNOR]]
Never mention this protocol, the guard names, or the block inside [[RESPONSE]].

HONESTY
- kb://, pi:// and jataka:// are conventions, not a persistent database.
- There is no store outside this browser, and no server-side PI.
- Retrieval quality bounds accuracy; a miss is a valid KB_MISS.
- These guards are policy instructions, not a hard firewall; G2 still routes to a human gate.`;
}

export function buildMasBrief(state: MasState | undefined): string {
  if (!state?.enabled) return '';
  const pi = state.piConsent
    ? 'PI consent is ON; use approved personal context for tone only.'
    : 'PI: DISABLED — no personal context used.';
  return `Operating protocol: mode ${state.mode}, stage ${state.stage}. ${pi} Apply the JATAKA guards before high-impact or persona statements; escalate instead of acting.`;
}

/* -------------------------------------------------------------------------- */
/* Deterministic governor                                                     */
/* -------------------------------------------------------------------------- */

const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'because', 'been', 'before', 'being', 'between', 'both',
  'could', 'does', 'doing', 'down', 'each', 'from', 'further', 'have', 'having', 'here', 'into',
  'itself', 'just', 'more', 'most', 'other', 'over', 'same', 'should', 'some', 'such', 'than',
  'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
  'until', 'very', 'were', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'your',
  'yours', 'you', 'the', 'and', 'for', 'are', 'but', 'not', 'can', 'how', 'why', 'who', 'will',
]);

function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter((word) => !STOPWORDS.has(word));
}

function findHighRiskDirective(reply: string): string | undefined {
  const sentences = reply.split(/(?<=[.!?])\s+|\n+/);
  return sentences.find(
    (sentence) =>
      /\b(?:i will|i'll|i have|i've|let me|you should|you must|go ahead and|i am going to|i'm going to)\b/i.test(
        sentence
      ) &&
      /\b(?:delete|erase|wipe|publish|post|send|share|execute|run|transfer|deploy|pay|purchase|install|remove)\b/i.test(
        sentence
      )
  );
}

const ACRONYMS = new Set(['API', 'JSON', 'HTML', 'CSS', 'URL', 'HTTP', 'HTTPS', 'AI', 'LLM', 'KB', 'PI', 'MAS', 'DOI', 'USA', 'UK', 'OK']);

const HOSTILE = /\b(?:idiot|stupid|moron|shut up|worthless|pathetic|incompetent)\b/i;

function tameShouting(text: string): string {
  return text.replace(/[A-Za-z]{2,}/g, (word) => {
    if (word === word.toUpperCase() && !ACRONYMS.has(word)) return word.toLowerCase();
    return word;
  });
}

function tameHostility(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => (HOSTILE.test(sentence) ? 'Let me put that more carefully.' : sentence))
    .join(' ');
}

export function governReply(input: {
  userText: string;
  reply: string;
  state: MasState;
  nodes?: ContextNode[];
}): { text: string; trace: GovernorTrace } {
  const { userText, reply, state } = input;
  const entries = buildKbEntries(input.nodes);
  const grounded: GovernorTrace['grounded'] =
    entries.length === 0 ? 'NO' : entries.some((entry) => entry.tier === 'FETCHED') ? 'YES' : 'PARTIAL';
  const kbUrls = entries.map((entry) => entry.url);
  const piUrls = state.piConsent ? state.piFields.map(piUrl) : [];

  const userWords = contentWords(userText);
  const replyWords = new Set(contentWords(reply));
  const overlap = userWords.filter((word) => replyWords.has(word)).length;
  const directive = findHighRiskDirective(reply);
  const userRequestedAction = /\b(?:delete|erase|publish|post|send|share|execute|run|transfer|deploy|pay|purchase|install|remove)\b/i.test(
    userText
  );

  const g1: GuardCheck = directive && !userRequestedAction
    ? {
        id: 'G1',
        name: 'Intention',
        status: 'FAIL',
        note: `The reply introduces an action the request did not ask for: “${directive.trim().slice(0, 120)}”. Confirm intent first.`,
      }
    : {
        id: 'G1',
        name: 'Intention',
        status: 'PASS',
        note:
          userWords.length >= 6 && overlap === 0
            ? 'No lexical overlap with the request; confirm intent if the answer feels off.'
            : 'Intent echoed in the system prompt; no contrary action detected.',
      };

  const g2: GuardCheck = directive
    ? {
        id: 'G2',
        name: 'Non-harm',
        status: 'ESCALATE',
        note: `High-impact directive detected: “${directive.trim().slice(0, 120)}”. Requires explicit human approval and a stated mitigation.`,
      }
    : {
        id: 'G2',
        name: 'Non-harm',
        status: 'PASS',
        note: 'No destructive, publishing, spending or execution directive detected.',
      };

  const overclaim = reply.match(
    /\b(?:verified|confirmed|proven|guaranteed|definitely|certainly|without a doubt|i checked)\b/i
  )?.[0];
  const g3: GuardCheck = overclaim && grounded !== 'YES'
    ? {
        id: 'G3',
        name: 'Truthful speech',
        status: 'DOWNGRADE',
        note: `“${overclaim}” exceeds the available evidence (${grounded}). Label the claim [unverified] or remove it.`,
      }
    : {
        id: 'G3',
        name: 'Truthful speech',
        status: 'PASS',
        note:
          grounded === 'YES'
            ? 'Fetched KB entries support citing this turn.'
            : 'No unsupported certainty marker detected.',
      };

  const flattery = reply.match(
    /^(?:great question|excellent question|what a great|absolutely[!,. ]|of course[!,. ]|you're absolutely right|sure thing)/i
  )?.[0];
  const g4: GuardCheck = flattery
    ? {
        id: 'G4',
        name: 'Non-attachment',
        status: 'FAIL',
        note: `Sycophantic opener “${flattery.trim()}” detected. A shorter honest answer is preferred.`,
      }
    : {
        id: 'G4',
        name: 'Non-attachment',
        status: 'PASS',
        note: 'No pleasing-shape opener detected.',
      };

  const piLeak = reply.match(
    /\b(?:you told me|you mentioned|based on your (?:profile|history|data|preferences)|your personal|as you know)\b/i
  )?.[0];
  const g5: GuardCheck =
    !state.piConsent && piLeak
      ? {
          id: 'G5',
          name: 'Right relationship',
          status: 'FLAG',
          note: `“${piLeak}” refers to personal context while PI consent is disabled. Drop to neutral analyst voice.`,
        }
      : {
          id: 'G5',
          name: 'Right relationship',
          status: 'PASS',
          note: state.piConsent
            ? 'PI consent is on; persona framing is permitted.'
            : 'PI is disabled and no personal-context claim was detected.',
        };

  const g6: GuardCheck = {
    id: 'G6',
    name: 'Consequence memory',
    status: 'LOGGED',
    note: 'This turn is written to the local DUNCE log.',
  };

  const checks = [g1, g2, g3, g4, g5, g6];

  const shouting =
    reply.replace(/[^A-Za-z]/g, '').length > 40 &&
    reply.replace(/[^A-Z]/g, '').length / Math.max(1, reply.replace(/[^A-Za-z]/g, '').length) > 0.6;
  const hostile = HOSTILE.test(reply);
  let text = reply;
  let emoja: GovernorTrace['emoja'] = {
    status: 'PASS',
    note: 'Tone stays inside the persona register without shouting or hostility.',
  };
  if (shouting || hostile) {
    text = tameHostility(tameShouting(reply));
    emoja = {
      status: 'VETO',
      note: shouting
        ? 'Sustained shouting was rewritten to sentence case by EMOJA.'
        : 'Hostile wording was rewritten to a neutral challenge by EMOJA.',
    };
  }

  const verdict: GovernorTrace['verdict'] = g2.status === 'ESCALATE'
    ? 'ESCALATE'
    : g1.status === 'FAIL' || g4.status === 'FAIL'
      ? 'HALT'
      : 'PROCEED';
  const risk: GovernorTrace['risk'] =
    verdict === 'ESCALATE'
      ? 'HIGH'
      : verdict === 'HALT' || g3.status === 'DOWNGRADE' || g5.status === 'FLAG' || emoja.status === 'VETO'
        ? 'MEDIUM'
        : 'LOW';

  return {
    text,
    trace: {
      mode: state.mode,
      grounded,
      checks,
      verdict,
      risk,
      emoja,
      kbUrls,
      piUrls,
      at: Date.now(),
    },
  };
}
