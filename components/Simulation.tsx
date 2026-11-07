import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  AgentMessage,
  AgentRole,
  Attachment,
  ContextNode,
  ContextNodeType,
  GovernorTrace,
  MasState,
  UserProfile,
} from '../types';
import { chatWithClone, fetchLinkContent, fetchSourceDocument, type CloneStreamState } from '../services/duet';
import { getApiKey, PROVIDERS, useLlmConfig } from '../services/llm';
import { ACCENT_CLASSES } from '../services/llm/providers';
import { clearSession, downloadFile, loadSession, saveSession, transcriptMarkdown } from '../services/session';
import { buildMasBrief, recordError, recordTurn } from '../services/mas';
import { isHttpUrl, parseCommand, suggestCommands } from '../services/commands';
import { buildPersonaforgeCommand, PERSONAFORGE_COMMAND, type ActiveForgeCommand } from '../services/personaforge';
import { Badge, Button, Field, Modal, inputClass } from './ui';
import {
  IconArrowLeft,
  IconChevronDown,
  IconCopy,
  IconDownload,
  IconFile,
  IconGlobe,
  IconLink,
  IconMenu,
  IconMic,
  IconPanelLeft,
  IconPlus,
  IconRefresh,
  IconSend,
  IconSettings,
  IconShield,
  IconSpark,
  IconStop,
  IconText,
  IconTrash,
  IconWarn,
  IconX,
  IconZap,
} from './icons';

interface SimulationProps {
  userProfile: UserProfile;
  onBack: () => void;
  onOpenSettings: () => void;
  onOpenProtocol: () => void;
  mas: MasState;
  onMasChange: (next: MasState) => void;
  onToast: (kind: 'error' | 'success' | 'info', title: string, detail?: string) => void;
}

type Emotion = 'neutral' | 'empathetic' | 'intense' | 'thoughtful' | 'joyful' | 'somber';

const EMOTION_COLOR: Record<Emotion, string> = {
  neutral: 'rgba(103, 232, 249,',
  joyful: 'rgba(34, 211, 238,',
  somber: 'rgba(96, 165, 250,',
  intense: 'rgba(168, 85, 247,',
  empathetic: 'rgba(52, 211, 153,',
  thoughtful: 'rgba(251, 191, 36,',
};

const SUGGESTIONS = [
  'What do you notice first that other people miss?',
  'Where is your worldview most likely to be wrong?',
  'What would you refuse to do, even for money?',
  'How should I think about this decision?',
];

/* -------------------------------------------------------------------------- */
/* The face                                                                   */
/* -------------------------------------------------------------------------- */

const PixelConsciousness: React.FC<{
  amplitude: number;
  emotion: Emotion;
  processing: boolean;
  small?: boolean;
}> = ({ amplitude, emotion, processing, small }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [blink, setBlink] = useState(false);
  // Amplitude changes ~12×/s; keep it in a ref so the render loop is not rebuilt.
  const amplitudeRef = useRef(amplitude);
  useEffect(() => {
    amplitudeRef.current = amplitude;
  }, [amplitude]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.7) {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
      }
    }, 3200);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const gridSize = small ? 20 : 40;
    const cellSize = canvas.width / gridSize;
    const particles = Array.from({ length: gridSize * gridSize }, (_, index) => ({
      x: index % gridSize,
      y: Math.floor(index / gridSize),
      brightness: Math.random(),
      speed: Math.random() * 0.05 + 0.01,
      phase: Math.random() * Math.PI * 2,
    }));

    const color = EMOTION_COLOR[emotion];

    const render = (time: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const amp = amplitudeRef.current;
      const pulse = Math.sin(time / 700) * 0.15 + 0.85;
      const centerX = gridSize / 2;
      const centerY = gridSize / 2;
      const eyeY = gridSize * 0.38;
      const mouthYBase = gridSize * 0.68;

      for (const p of particles) {
        p.brightness += p.speed * (processing ? 3 : 1);
        if (p.brightness > 1) p.brightness = 0;

        const isLeftEye = Math.abs(p.y - eyeY) < 1.8 && Math.abs(p.x - gridSize * 0.3) < 1.8;
        const isRightEye = Math.abs(p.y - eyeY) < 1.8 && Math.abs(p.x - gridSize * 0.7) < 1.8;
        const mouthXDist = Math.abs(p.x - centerX);

        let mouthShapeY = mouthYBase;
        if (emotion === 'joyful') mouthShapeY += Math.pow(mouthXDist / (gridSize * 0.25), 2) * -2;
        else if (emotion === 'somber') mouthShapeY += Math.pow(mouthXDist / (gridSize * 0.25), 2) * 1.5;
        else if (emotion === 'intense') mouthShapeY += (Math.random() - 0.5) * 0.5;

        const mouthOpening = amp * 5;
        const isMouth =
          Math.abs(p.y - (mouthShapeY + Math.sin(p.x * 0.5 + time * 0.01) * mouthOpening)) < 1 + mouthOpening &&
          mouthXDist < gridSize * 0.22;

        let multiplier = 1;
        if (isLeftEye || isRightEye) {
          multiplier = blink ? 0.1 : emotion === 'intense' ? 3.5 : 2.5;
          if (emotion === 'thoughtful') multiplier *= 0.8 + Math.sin(time * 0.001) * 0.2;
        }
        if (isMouth) multiplier = 2 + amp * 4;

        const distance = Math.sqrt(Math.pow(p.x - centerX, 2) + Math.pow(p.y - centerY, 2));
        const normalized = distance / (gridSize / 1.4);
        let opacity = (1 - normalized) * p.brightness * pulse * multiplier;
        if (processing) opacity *= 1.3;
        opacity = Math.max(0, Math.min(1, opacity + (isMouth ? amp : 0)));

        if (opacity > 0.01) {
          ctx.fillStyle = `${color} ${opacity})`;
          const drawSize = cellSize * (0.7 + (isMouth ? amp * 0.8 : 0));
          const floatX = Math.sin(time * 0.002 + p.phase) * 0.5;
          const floatY = Math.cos(time * 0.002 + p.phase) * 0.5;
          ctx.fillRect(p.x * cellSize + floatX, p.y * cellSize + floatY, drawSize, drawSize);
        }
      }
      animationRef.current = requestAnimationFrame(render);
    };

    animationRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationRef.current);
  }, [emotion, processing, small, blink]);

  return (
    <canvas
      ref={canvasRef}
      width={small ? 160 : 480}
      height={small ? 160 : 480}
      className="h-full w-full opacity-95 mix-blend-screen"
      aria-hidden="true"
    />
  );
};

/* -------------------------------------------------------------------------- */
/* Streaming draft                                                            */
/* -------------------------------------------------------------------------- */

const DraftCard: React.FC<{ state: CloneStreamState | null }> = ({ state }) => {
  const hasAny = !!state && (state.primary || state.meta || state.response);
  return (
    <div className="animate-message-in">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-neutral-500">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-cyan-400" />
        </span>
        simulating
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0c0c0c] px-4 py-4 sm:px-6 sm:py-5">
        {!hasAny && (
          <div className="space-y-2.5">
            {[92, 78, 64].map((width) => (
              <div key={width} className="h-2.5 overflow-hidden rounded-full bg-white/[0.04]">
                <div className="h-full w-1/3 animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            ))}
          </div>
        )}

        {state?.primary && (
          <div className="mb-4">
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.26em] text-cyan-400/70">primary</p>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-cyan-100/70">{state.primary}</p>
          </div>
        )}

        {state?.meta && (
          <div className="mb-4 rounded-xl border border-violet-500/15 bg-violet-500/[0.04] px-3 py-2.5">
            <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.26em] text-violet-400/70">meta</p>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-violet-100/60">{state.meta}</p>
          </div>
        )}

        {state?.response && (
          <div className="duet-prose text-[14px] text-neutral-100 sm:text-[15px]">
            <ReactMarkdown>{state.response}</ReactMarkdown>
            <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-caret bg-cyan-400" />
          </div>
        )}
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Message                                                                    */
/* -------------------------------------------------------------------------- */

interface MessageProps {
  message: AgentMessage;
  persona: string;
  isLastClone: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => void;
  onExport: (message: AgentMessage) => void;
  onRegenerate: () => void;
  onOpenImage: (attachment: Attachment) => void;
  onRetry?: () => void;
}

const GUARD_CHIP: Record<string, string> = {
  PASS: 'border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-300/80',
  LOGGED: 'border-white/10 bg-white/[0.03] text-neutral-500',
  DOWNGRADE: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-300',
  FLAG: 'border-amber-500/25 bg-amber-500/[0.07] text-amber-300',
  FAIL: 'border-red-500/25 bg-red-500/[0.07] text-red-300',
  ESCALATE: 'border-red-500/30 bg-red-500/[0.09] text-red-300',
};

const GovernorStrip: React.FC<{ trace: GovernorTrace }> = ({ trace }) => {
  const [open, setOpen] = useState(false);
  const issues = trace.checks.filter((check) => check.status !== 'PASS' && check.status !== 'LOGGED');
  const forgeNotes = trace.forge?.notes ?? [];
  const hasIssues = issues.length > 0 || forgeNotes.length > 0 || trace.emoja.status === 'VETO';

  return (
    <div className="mt-3 rounded-xl border border-white/[0.07] bg-white/[0.015] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[8px] uppercase tracking-[0.22em] text-neutral-600">governor</span>
        <Badge tone="neutral">{trace.mode}</Badge>
        <Badge tone={trace.grounded === 'YES' ? 'green' : trace.grounded === 'PARTIAL' ? 'amber' : 'neutral'}>
          grounded {trace.grounded.toLowerCase()}
        </Badge>
        <Badge tone={trace.risk === 'HIGH' ? 'amber' : trace.risk === 'MEDIUM' ? 'cyan' : 'green'}>
          {trace.risk.toLowerCase()} risk
        </Badge>
        <Badge tone={trace.verdict === 'PROCEED' ? 'green' : 'amber'}>{trace.verdict.toLowerCase()}</Badge>
        <Badge tone={trace.emoja.status === 'PASS' ? 'green' : 'amber'}>
          emoja {trace.emoja.status.toLowerCase()}
        </Badge>
        {trace.forge && (
          <Badge tone={trace.forge.status === 'PASS' ? 'green' : 'amber'}>
            forge {trace.forge.status.toLowerCase()}
          </Badge>
        )}
        {hasIssues && (
          <button
            onClick={() => setOpen((value) => !value)}
            className="ml-auto font-mono text-[8.5px] uppercase tracking-[0.14em] text-neutral-500 hover:text-white"
          >
            {open ? 'hide' : 'why'}
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {trace.checks.map((check) => (
          <span
            key={check.id}
            title={check.note}
            className={`rounded border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] ${
              GUARD_CHIP[check.status] ?? GUARD_CHIP.LOGGED
            }`}
          >
            {check.id} {check.status.toLowerCase()}
          </span>
        ))}
      </div>

      {open && (
        <div className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
          {issues.length === 0 && !trace.forge ? (
            <p className="text-[10.5px] leading-relaxed text-neutral-500">No guard triggered this turn.</p>
          ) : (
            issues.map((check) => (
              <p key={check.id} className="text-[10.5px] leading-relaxed text-neutral-500">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-neutral-400">
                  {check.id} {check.name}
                </span>{' '}
                — {check.note}
              </p>
            ))
          )}
          {trace.emoja.status === 'VETO' && (
            <p className="text-[10.5px] leading-relaxed text-amber-300/80">EMOJA — {trace.emoja.note}</p>
          )}
          {trace.forge && (
            <div className="space-y-1">
              <p className="text-[10.5px] leading-relaxed text-neutral-500">
                <span className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-violet-300/80">
                  PERSONAFORGE {trace.forge.status}
                </span>{' '}
                — {trace.forge.grounded.toLowerCase()} grounding · {trace.forge.questions} question
                {trace.forge.questions === 1 ? '' : 's'} this turn
              </p>
              {forgeNotes.map((note, index) => (
                <p key={index} className="text-[10.5px] leading-relaxed text-violet-300/80">
                  {note}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const MessageCard: React.FC<MessageProps> = ({
  message,
  persona,
  isLastClone,
  expanded,
  onToggle,
  onCopy,
  onExport,
  onRegenerate,
  onOpenImage,
  onRetry,
}) => {
  const isUser = message.role === AgentRole.USER;
  const failed = message.content.startsWith('__error__');
  const content = failed ? message.content.replace('__error__', '').trim() : message.content;

  return (
    <div className={`group flex flex-col ${isUser ? 'items-end' : 'items-start'} animate-message-in`}>
      <div
        className={`mb-1.5 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.18em] text-neutral-600 ${
          isUser ? 'flex-row-reverse' : ''
        }`}
      >
        <span className={isUser ? 'text-neutral-500' : 'text-cyan-500/70'}>{isUser ? 'you' : persona}</span>
        <span className="opacity-40">·</span>
        <span>{new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>

      <div className={`flex max-w-full items-start gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <div
          className={`max-w-[calc(100vw-2.5rem)] rounded-2xl px-4 py-3.5 sm:max-w-[46rem] sm:px-5 sm:py-4 ${
            isUser
              ? 'rounded-br-md border border-cyan-500/20 bg-cyan-500/[0.08] text-[14px] leading-relaxed text-cyan-50'
              : failed
                ? 'rounded-bl-md border border-red-500/30 bg-red-500/[0.06] text-red-200'
                : 'rounded-bl-md border border-white/[0.09] bg-[#0c0c0c] text-neutral-100'
          }`}
        >
          {failed ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-start gap-2">
                <IconWarn size={15} className="mt-0.5 shrink-0" />
                <p className="text-[13px] leading-relaxed">{content}</p>
              </div>
              {onRetry && (
                <button
                  onClick={onRetry}
                  className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-300 hover:border-cyan-500/40 hover:text-cyan-300"
                >
                  <IconRefresh size={12} /> retry
                </button>
              )}
            </div>
          ) : isUser ? (
            <p className="whitespace-pre-wrap">{content}</p>
          ) : (
            <div className="duet-prose text-[14px] sm:text-[15px]">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          )}

          {message.attachments?.map((attachment, index) => (
            <button
              key={index}
              onClick={() => onOpenImage(attachment)}
              className="mt-3 block overflow-hidden rounded-xl border border-white/10 bg-black/40 transition-transform hover:scale-[1.01]"
            >
              <img
                src={`data:${attachment.mimeType};base64,${attachment.data}`}
                alt={attachment.name || 'visualisation'}
                className="max-h-72 w-full object-cover brightness-95 transition-all hover:brightness-110"
              />
            </button>
          ))}

          {message.governor && <GovernorStrip trace={message.governor} />}

          {message.internalThoughts && message.internalThoughts.length > 0 && (
            <div className="mt-3 border-t border-white/[0.07] pt-2.5">
              <button
                onClick={onToggle}
                className="inline-flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.18em] text-cyan-400/60 transition-colors hover:text-cyan-300"
              >
                <span className="h-1 w-1 rounded-full bg-cyan-400/60" />
                {expanded ? 'hide reasoning' : 'show reasoning'}
                <IconChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>

              {expanded && (
                <div className="mt-2.5 space-y-2 animate-fade-in">
                  {message.internalThoughts.map((thought, index) => (
                    <div
                      key={index}
                      className={`rounded-xl border px-3 py-2.5 ${
                        thought.role === AgentRole.PRIMARY
                          ? 'border-cyan-500/15 bg-cyan-500/[0.04]'
                          : 'border-violet-500/15 bg-violet-500/[0.04]'
                      }`}
                    >
                      <p
                        className={`mb-1 font-mono text-[8.5px] uppercase tracking-[0.26em] ${
                          thought.role === AgentRole.PRIMARY ? 'text-cyan-400/60' : 'text-violet-400/60'
                        }`}
                      >
                        {thought.role}
                      </p>
                      <p className="whitespace-pre-wrap font-mono text-[11.5px] leading-relaxed text-neutral-400">
                        {thought.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Hover actions */}
        <div className="flex flex-col gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            onClick={() => onCopy(content)}
            title="Copy"
            aria-label="Copy message"
            className="rounded-lg p-1.5 text-neutral-600 hover:bg-white/[0.06] hover:text-neutral-200"
          >
            <IconCopy size={14} />
          </button>
          <button
            onClick={() => onExport(message)}
            title="Save as text"
            aria-label="Save message"
            className="rounded-lg p-1.5 text-neutral-600 hover:bg-white/[0.06] hover:text-neutral-200"
          >
            <IconDownload size={14} />
          </button>
          {isLastClone && !failed && (
            <button
              onClick={onRegenerate}
              title="Regenerate"
              aria-label="Regenerate reply"
              className="rounded-lg p-1.5 text-neutral-600 hover:bg-white/[0.06] hover:text-neutral-200"
            >
              <IconRefresh size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Menu                                                                       */
/* -------------------------------------------------------------------------- */

const HeaderMenu: React.FC<{
  items: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }>;
}> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-label="Session menu"
        aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
      >
        <IconMenu size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-50 w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0d0d0d] p-1.5 shadow-3xl animate-fade-in">
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors ${
                item.danger
                  ? 'text-red-400 hover:bg-red-500/10'
                  : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Simulation                                                                 */
/* -------------------------------------------------------------------------- */

export const Simulation: React.FC<SimulationProps> = ({
  userProfile,
  onBack,
  onOpenSettings,
  onOpenProtocol,
  mas,
  onMasChange,
  onToast,
}) => {
  const config = useLlmConfig();
  const meta = PROVIDERS[config.provider];
  const accent = ACCENT_CLASSES[meta.accent];

  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [contextNodes, setContextNodes] = useState<ContextNode[]>([]);
  const [activeCommand, setActiveCommand] = useState<ActiveForgeCommand | null>(null);
  const [input, setInput] = useState('');
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [draft, setDraft] = useState<CloneStreamState | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [selectedImage, setSelectedImage] = useState<Attachment | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [nodeModal, setNodeModal] = useState(false);
  const [nodeType, setNodeType] = useState<ContextNodeType>('link');
  const [nodeValue, setNodeValue] = useState('');
  const [nodeTitle, setNodeTitle] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [amplitude, setAmplitude] = useState(0);
  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const commandMatches = useMemo(() => suggestCommands(input), [input]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nodeFileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveSessionRef = useRef<any>(null);
  const audioRef = useRef<{ input: AudioContext; output: AudioContext } | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const amplitudeTimerRef = useRef<number | null>(null);
  const nextStartTimeRef = useRef(0);
  const pausedRef = useRef(isPaused);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  /* ----------------------------- session restore ---------------------------- */

  useEffect(() => {
    const saved = loadSession(userProfile);
    if (saved) {
      setMessages(saved.messages);
      setContextNodes(saved.contextNodes);
    }
    setHydrated(true);
  }, [userProfile]);

  useEffect(() => {
    if (!hydrated) return;
    saveSession(userProfile, messages, contextNodes);
  }, [hydrated, messages, contextNodes, userProfile]);

  /* ------------------------------- scrolling -------------------------------- */

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: messages.length > 1 ? 'smooth' : 'auto' });
  }, [messages, draft, isProcessing]);

  /* ------------------------------ typing pulse ------------------------------ */

  useEffect(() => {
    if (!isProcessing) {
      setAmplitude(0);
      return;
    }
    let frame = 0;
    const interval = window.setInterval(() => {
      frame += 1;
      setAmplitude(Math.abs(Math.sin(frame * 0.4)) * 0.22 + Math.random() * 0.12);
    }, 80);
    return () => clearInterval(interval);
  }, [isProcessing]);

  useEffect(() => {
    const lower = messages[messages.length - 1]?.content?.toLowerCase() ?? '';
    if (!lower) return;
    if (lower.includes('must') || lower.includes('crisis') || lower.includes('critical')) setEmotion('intense');
    else if (lower.includes('sorry') || lower.includes('sad') || lower.includes('grief')) setEmotion('somber');
    else if (lower.includes('perhaps') || lower.includes('analy') || lower.includes('logic')) setEmotion('thoughtful');
    else if (lower.includes('feel') || lower.includes('connect') || lower.includes('together')) setEmotion('empathetic');
    else if (lower.includes('happy') || lower.includes('joy') || lower.includes('excellent')) setEmotion('joyful');
    else setEmotion('neutral');
  }, [messages]);

  /* --------------------------------- helpers -------------------------------- */

  const addToast = useCallback(
    (kind: 'error' | 'success' | 'info', title: string, detail?: string) => onToast(kind, title, detail),
    [onToast]
  );

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      addToast('success', 'Copied');
    } catch {
      addToast('error', 'Could not copy', 'Your browser blocked clipboard access.');
    }
  };

  const runClone = useCallback(
    async (
      history: AgentMessage[],
      text: string,
      files: Attachment[],
      commandArg?: ActiveForgeCommand | null
    ) => {
      // undefined means "use the active command"; null means "force normal chat".
      const command = commandArg === undefined ? activeCommand : commandArg;
      setError(null);
      setIsProcessing(true);
      setDraft(null);
      const controller = new AbortController();
      abortRef.current = controller;

      const readyNodes = contextNodes.filter((node) => node.status === 'ready');

      if (mas.enabled && mas.mode === 'KB-PRIMARY' && readyNodes.length === 0) {
        const miss = '[KB_MISS] KB-PRIMARY mode needs at least one ready KB entry. Inject a link or text node, or switch the protocol mode.';
        setError(miss);
        addToast('error', 'KB_MISS', 'No KB entry cleared the threshold.');
        setIsProcessing(false);
        abortRef.current = null;
        return;
      }

      try {
        const response = await chatWithClone(history, text, userProfile, files, readyNodes, {
          signal: controller.signal,
          onDelta: (_raw, parsed) => setDraft(parsed),
          mas,
          kb: readyNodes,
          command: command ?? undefined,
        });

        const cloneMessage: AgentMessage = {
          id: `clone-${Date.now()}`,
          role: AgentRole.CLONE,
          content: response.finalResponse,
          timestamp: Date.now(),
          internalThoughts: [
            { role: AgentRole.PRIMARY, content: response.primaryThought },
            { role: AgentRole.META, content: response.metaThought },
          ],
          governor: response.governor,
        };

        if (response.governor) onMasChange(recordTurn(mas, response.governor));

        if (response.sketchUrl) {
          cloneMessage.attachments = [
            {
              mimeType: 'image/png',
              data: response.sketchUrl.split(',')[1],
              name: `sketch-${Date.now()}.png`,
            },
          ];
        }

        setMessages((previous) => [...previous, cloneMessage]);
      } catch (err) {
        const aborted = controller.signal.aborted;
        if (aborted) {
          addToast('info', 'Generation stopped');
        } else {
          const message = err instanceof Error ? err.message : 'Unknown fault.';
          setError(message);
          onMasChange(recordError(mas, message));
          addToast('error', 'The link dropped', message);
        }
      } finally {
        abortRef.current = null;
        setIsProcessing(false);
        setDraft(null);
      }
    },
    [activeCommand, addToast, contextNodes, mas, onMasChange, userProfile]
  );

  const exitCommand = useCallback(() => {
    setActiveCommand(null);
    addToast('info', 'PERSONAFORGE off', 'Back to the persona’s normal voice.');
  }, [addToast]);

  const send = async () => {
    const text = input.trim();
    if (isPaused || isProcessing) return;
    if (!text && pendingAttachments.length === 0) return;

    const command = parseCommand(text);

    // /forge exit leaves the command without sending a turn.
    if (command?.name === 'forge' && /^exit$/i.test(command.arg)) {
      exitCommand();
      setInput('');
      return;
    }

    if (command?.name === 'forge') {
      if (!isHttpUrl(command.arg)) {
        addToast('error', 'PERSONAFORGE needs one URL', `Use ${PERSONAFORGE_COMMAND.usage} — one page per command.`);
        return;
      }

      const userMessage: AgentMessage = {
        id: `user-${Date.now()}`,
        role: AgentRole.USER,
        content: text,
        timestamp: Date.now(),
        attachments: [...pendingAttachments],
      };
      const next = [...messages, userMessage];
      setMessages(next);
      setInput('');
      setPendingAttachments([]);
      if (textareaRef.current) textareaRef.current.style.height = 'auto';
      setIsProcessing(true);

      try {
        const source = await fetchSourceDocument(command.arg);
        const prompt = buildPersonaforgeCommand({
          url: command.arg,
          profile: userProfile,
          sourceText: source.text,
          sourceTitle: source.title,
          nodes: contextNodes.filter((node) => node.status === 'ready'),
        });
        const active: ActiveForgeCommand = {
          id: 'forge',
          url: command.arg,
          prompt,
          label: 'PERSONAFORGE',
          grounded: source.via === 'jina' ? 'SOURCE' : 'PARTIAL',
        };
        setActiveCommand(active);
        addToast(
          'info',
          'PERSONAFORGE armed',
          source.via === 'jina'
            ? 'Source fetched. Phase 1 will extract the cast; confirm it before Phase 2.'
            : 'Source could not be fetched. The command will mark unknowns instead of inventing them.'
        );
        await runClone(next, text, userMessage.attachments ?? [], active);
      } catch (err) {
        setIsProcessing(false);
        addToast('error', 'Command failed', err instanceof Error ? err.message : 'Unknown fault.');
      }
      return;
    }

    const userMessage: AgentMessage = {
      id: `user-${Date.now()}`,
      role: AgentRole.USER,
      content: text,
      timestamp: Date.now(),
      attachments: [...pendingAttachments],
    };

    const next = [...messages, userMessage];
    setMessages(next);
    setInput('');
    setPendingAttachments([]);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    await runClone(next, text, userMessage.attachments ?? []);
  };

  const regenerate = async () => {
    if (isProcessing) return;
    const lastUser = [...messages].reverse().find((message) => message.role === AgentRole.USER);
    if (!lastUser) return;
    const index = messages.lastIndexOf(lastUser);
    const history = messages.slice(0, index + 1);
    setMessages(history);
    await runClone(history, lastUser.content, lastUser.attachments ?? []);
  };

  const retryLast = () => {
    const lastUser = [...messages].reverse().find((message) => message.role === AgentRole.USER);
    if (!lastUser) return;
    void runClone(messages, lastUser.content, lastUser.attachments ?? []);
  };

  const stop = () => {
    abortRef.current?.abort();
  };

  const restart = () => {
    if (!confirm('Clear this conversation? The persona stays.')) return;
    abortRef.current?.abort();
    setMessages([]);
    setDraft(null);
    setError(null);
    setActiveCommand(null);
    clearSession();
  };

  const endSession = () => {
    if (!confirm('Leave this duet and return to persona selection?')) return;
    abortRef.current?.abort();
    setActiveCommand(null);
    onBack();
  };

  const exportTranscript = () => {
    if (messages.length === 0) {
      addToast('info', 'Nothing to export yet');
      return;
    }
    downloadFile(
      transcriptMarkdown(userProfile, messages),
      `duet-${userProfile.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`,
      'text/markdown'
    );
  };

  /* -------------------------------- files ---------------------------------- */

  const readFile = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });

  const handleAttach = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;

    const accepted: Attachment[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        addToast('info', 'Images only', `${file.name} is not an image. Use “Inject node” for text or links.`);
        continue;
      }
      if (file.size > 8 * 1024 * 1024) {
        addToast('error', 'Image too large', `${file.name} is over 8 MB.`);
        continue;
      }
      const dataUrl = await readFile(file);
      accepted.push({ mimeType: file.type, data: dataUrl.split(',')[1], name: file.name });
    }
    if (accepted.length) setPendingAttachments((previous) => [...previous, ...accepted]);
  };

  const handleNodeFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const dataUrl = await readFile(file);
    const base64 = dataUrl.split(',')[1];
    addContextNode('file', file.name, base64, file.type);
  };

  const addContextNode = async (type: ContextNodeType, title: string, content: string, mimeType?: string) => {
    if (!content.trim()) return;
    const id = `node-${Math.random().toString(36).slice(2, 10)}`;
    const node: ContextNode = {
      id,
      type,
      title: title || (type === 'link' ? 'Linking perspective…' : `node-${Date.now()}`),
      content,
      sourceUrl: type === 'link' ? content : undefined,
      mimeType,
      timestamp: Date.now(),
      status: type === 'link' ? 'fetching' : 'ready',
    };

    setContextNodes((previous) => [...previous, node]);
    setNodeModal(false);
    setNodeValue('');
    setNodeTitle('');

    if (type === 'link') {
      try {
        const { title: fetchedTitle, summary } = await fetchLinkContent(content);
        setContextNodes((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, title: fetchedTitle, content: summary, status: 'ready' } : item
          )
        );
      } catch {
        setContextNodes((previous) =>
          previous.map((item) =>
            item.id === id ? { ...item, status: 'error', title: 'Fetch failed' } : item
          )
        );
        addToast('error', 'Could not read that link', 'Try another URL or paste the text as a node.');
      }
    }
  };

  /* --------------------------------- voice --------------------------------- */

  const stopLive = useCallback(() => {
    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch {
        // Ignore.
      }
      liveSessionRef.current = null;
    }
    if (audioRef.current) {
      try {
        audioRef.current.input.close();
        audioRef.current.output.close();
      } catch {
        // Ignore.
      }
      audioRef.current = null;
    }
    if (amplitudeTimerRef.current) {
      clearInterval(amplitudeTimerRef.current);
      amplitudeTimerRef.current = null;
    }
    analyserRef.current = null;
    setIsLive(false);
    setAmplitude(0);
  }, []);

  useEffect(() => () => stopLive(), [stopLive]);

  const startLive = async () => {
    const geminiKey = getApiKey('gemini');
    if (!geminiKey) {
      addToast(
        'info',
        'Voice needs a Gemini key',
        'The live voice link uses Gemini native audio. Add a Google AI Studio key in Settings.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtor({ sampleRate: 16000 });
      const outputCtx = new AudioCtor({ sampleRate: 24000 });
      const analyser = outputCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;
      audioRef.current = { input: inputCtx, output: outputCtx };
      setIsLive(true);

      const { GoogleGenAI, Modality } = await import('@google/genai');
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            const source = inputCtx.createMediaStreamSource(stream);
            const processor = inputCtx.createScriptProcessor(4096, 1, 1);
            processor.onaudioprocess = (event) => {
              if (pausedRef.current) return;
              const data = event.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(data.length);
              for (let index = 0; index < data.length; index += 1) int16[index] = data[index] * 32768;
              const pcmBlob = {
                data: btoa(String.fromCharCode(...new Uint8Array(int16.buffer))),
                mimeType: 'audio/pcm;rate=16000',
              };
              sessionPromise.then((session) => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(processor);
            processor.connect(inputCtx.destination);
          },
          onmessage: (message: any) => {
            const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (!base64Audio) return;
            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
            const binary = atob(base64Audio);
            const bytes = new Uint8Array(binary.length);
            for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
            const pcm = new Int16Array(bytes.buffer);
            const buffer = outputCtx.createBuffer(1, pcm.length, 24000);
            const channel = buffer.getChannelData(0);
            for (let index = 0; index < pcm.length; index += 1) channel[index] = pcm[index] / 32768;
            const source = outputCtx.createBufferSource();
            source.buffer = buffer;
            source.connect(analyser);
            analyser.connect(outputCtx.destination);
            source.start(nextStartTimeRef.current);
            nextStartTimeRef.current += buffer.duration;
          },
          onclose: () => stopLive(),
          onerror: () => {
            addToast('error', 'Voice link failed', 'Gemini closed the audio session.');
            stopLive();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are the voice of ${userProfile.name}. Speak as them, in short turns.${
            buildMasBrief(mas) ? `\n\n${buildMasBrief(mas)}` : ''
          }`,
        },
      });

      liveSessionRef.current = await sessionPromise;

      amplitudeTimerRef.current = window.setInterval(() => {
        const node = analyserRef.current;
        if (!node) return;
        const data = new Uint8Array(node.frequencyBinCount);
        node.getByteFrequencyData(data);
        const average = data.reduce((total, value) => total + value, 0) / data.length / 160;
        setAmplitude(average);
      }, 90);
    } catch (err) {
      stopLive();
      addToast('error', 'Microphone unavailable', err instanceof Error ? err.message : 'Permission denied.');
    }
  };

  /* --------------------------------- render -------------------------------- */

  const lastCloneId = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].role === AgentRole.CLONE) return messages[index].id;
    }
    return null;
  }, [messages]);

  const nodeReadyCount = contextNodes.filter((node) => node.status === 'ready').length;

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-white/[0.06] px-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-600 shadow-lg shadow-cyan-500/20">
          <span className="font-display text-sm font-bold text-black">D</span>
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[13px] font-semibold tracking-tight text-white">
              Duet
            </p>
            <p className="truncate font-mono text-[8px] uppercase tracking-[0.2em] text-neutral-600">
              parallel consciousness
            </p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((value) => !value)}
          aria-label="Collapse sidebar"
          className="hidden h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:bg-white/[0.06] hover:text-white lg:flex"
        >
          <IconPanelLeft size={15} />
        </button>
        <button
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 hover:text-white lg:hidden"
        >
          <IconX size={16} />
        </button>
      </div>

      {/* Persona */}
      <div className="shrink-0 border-b border-white/[0.06] p-3">
        <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black">
            {userProfile.avatarUrl ? (
              <img
                src={userProfile.avatarUrl}
                alt={userProfile.name}
                className="h-full w-full object-cover opacity-90 grayscale transition-all duration-700 hover:grayscale-0"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center font-mono text-sm text-cyan-400">
                {userProfile.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-white">{userProfile.name}</p>
              <p className="truncate font-mono text-[8.5px] uppercase tracking-[0.18em] text-neutral-500">
                {userProfile.source === 'search' ? 'grounded persona' : 'custom persona'}
              </p>
            </div>
          )}
        </div>
        {!collapsed && (
          <>
            {userProfile.topic && (
              <p className="mt-2.5 rounded-lg border border-cyan-500/15 bg-cyan-500/[0.05] px-2.5 py-1.5 text-[10.5px] leading-relaxed text-cyan-200/70">
                Topic: {userProfile.topic}
              </p>
            )}
            <p className="mt-2.5 line-clamp-4 border-l border-white/10 pl-2.5 text-[11px] leading-relaxed text-neutral-500">
              {userProfile.bio}
            </p>
          </>
        )}
      </div>

      {/* Protocol */}
      <div className="shrink-0 border-b border-white/[0.06] px-3 py-2">
        <button
          onClick={onOpenProtocol}
          className={`flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-cyan-500/30 ${
            collapsed ? 'justify-center' : ''
          }`}
          title="Operating protocol"
        >
          <IconShield size={13} className={mas.enabled ? 'text-cyan-400/70' : 'text-neutral-600'} />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400">
                {mas.enabled ? `${mas.mode.toLowerCase()} · stage ${mas.stage}` : 'protocol bypassed'}
              </span>
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  !mas.enabled ? 'bg-neutral-600' : mas.piConsent ? 'bg-emerald-400' : 'bg-cyan-400'
                }`}
              />
            </>
          )}
        </button>
      </div>

      {/* Nodes */}
      <div className="flex min-h-0 flex-1 flex-col p-3">
        <div className={`mb-2 flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          {!collapsed && (
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-neutral-500">
              context · {nodeReadyCount}
            </span>
          )}
          <button
            onClick={() => setNodeModal(true)}
            title="Inject context"
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-neutral-400 hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <IconPlus size={13} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto scrollbar-hide">
          {contextNodes.length === 0 && !collapsed && (
            <p className="px-1 py-4 text-center font-mono text-[9.5px] leading-relaxed text-neutral-700">
              no context injected
              <br />
              links, text or files
            </p>
          )}
          {contextNodes.map((node) => (
            <div
              key={node.id}
              className={`group flex items-center gap-2 rounded-lg border px-2 py-1.5 ${
                node.status === 'error'
                  ? 'border-red-500/25 bg-red-500/[0.04]'
                  : 'border-white/[0.06] bg-white/[0.02]'
              }`}
              title={node.title}
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  node.status === 'fetching'
                    ? 'animate-pulse bg-amber-400'
                    : node.status === 'error'
                      ? 'bg-red-500'
                      : node.type === 'link'
                        ? 'bg-cyan-400'
                        : 'bg-violet-400'
                }`}
              />
              {!collapsed && (
                <span className="min-w-0 flex-1 truncate text-[10.5px] text-neutral-300">{node.title}</span>
              )}
              <button
                onClick={() => setContextNodes((previous) => previous.filter((item) => item.id !== node.id))}
                aria-label={`Remove ${node.title}`}
                className="shrink-0 text-neutral-700 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
              >
                <IconX size={11} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Connection */}
      <div className="shrink-0 border-t border-white/[0.06] p-3">
        <button
          onClick={onOpenSettings}
          className={`flex w-full items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-2.5 py-2 text-left transition-colors hover:border-white/15 ${
            collapsed ? 'justify-center' : ''
          }`}
          title={`${meta.name} · ${config.model}`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${accent.dot}`} />
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[10.5px] text-neutral-300">{meta.short}</span>
              <span className="block truncate font-mono text-[8.5px] text-neutral-600">
                {config.model.split('/').pop()}
              </span>
            </span>
          )}
          {!collapsed && <IconSettings size={13} className="shrink-0 text-neutral-600" />}
        </button>
        {!collapsed && (
          <button
            onClick={onBack}
            className="mt-1.5 flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-neutral-600 transition-colors hover:text-white"
          >
            <IconArrowLeft size={12} /> new persona
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-[#030303]">
      {/* Desktop sidebar */}
      <aside
        className={`hidden shrink-0 border-r border-white/[0.06] bg-[#070707]/80 transition-all duration-300 lg:flex ${
          collapsed ? 'w-[68px]' : 'w-[280px]'
        }`}
      >
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[320px] border-r border-white/10 bg-[#070707] shadow-3xl animate-fade-in">
            {sidebar}
          </div>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-white/[0.06] bg-[#070707]/90 px-2.5 backdrop-blur-xl sm:px-4">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-neutral-400 hover:bg-white/[0.06] hover:text-white lg:hidden"
          >
            <IconMenu size={17} />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${isProcessing ? 'animate-pulse bg-cyan-400' : isPaused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-medium leading-tight text-white">{userProfile.name}</p>
              <p className="truncate font-mono text-[8.5px] uppercase tracking-[0.16em] text-neutral-500">
                {isPaused ? 'link paused' : isProcessing ? 'simulating' : isLive ? 'voice link live' : 'link stable'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={onOpenProtocol}
              className="flex h-9 items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
              title="Operating protocol (MAS · JATAKA)"
            >
              <IconShield size={13} />
              <span className="hidden max-w-[90px] truncate sm:inline">
                {mas.enabled ? mas.mode.toLowerCase() : 'bypass'}
              </span>
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  !mas.enabled ? 'bg-neutral-600' : mas.stage === 2 ? 'bg-amber-400' : mas.piConsent ? 'bg-emerald-400' : 'bg-cyan-400'
                }`}
              />
            </button>

            <button
              onClick={onOpenSettings}
              className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:border-white/20 hover:text-white sm:flex"
              title="Model settings"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
              <span className="max-w-[130px] truncate">{config.model.split('/').pop()}</span>
            </button>

            <button
              onClick={() => setIsPaused((value) => !value)}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 font-mono text-[9px] uppercase tracking-[0.14em] transition-colors ${
                isPaused
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:text-white'
              }`}
              title={isPaused ? 'Resume' : 'Pause'}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-neutral-600'}`} />
              <span className="hidden sm:inline">{isPaused ? 'resume' : 'pause'}</span>
            </button>

            <HeaderMenu
              items={[
                { label: 'Export transcript', icon: <IconDownload size={14} />, onClick: exportTranscript },
                { label: 'Restart session', icon: <IconRefresh size={14} />, onClick: restart },
                { label: 'New persona', icon: <IconArrowLeft size={14} />, onClick: endSession },
                { label: 'End session', icon: <IconTrash size={14} />, onClick: endSession, danger: true },
              ]}
            />
          </div>
        </header>

        {/* Thread */}
        <main ref={scrollRef} className="relative flex-1 overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 dot-overlay opacity-[0.025]" />
          <div className="relative mx-auto w-full max-w-3xl px-3 py-5 sm:px-5 sm:py-7">
            {messages.length === 0 && !isProcessing && (
              <div className="flex flex-col items-center py-6 text-center animate-fade-in">
                <div className="mb-4 h-32 w-32 opacity-90 sm:h-40 sm:w-40">
                  <PixelConsciousness amplitude={0.05} emotion="neutral" processing={false} />
                </div>
                <h2 className="font-display text-lg font-medium tracking-tight text-white sm:text-xl">
                  {userProfile.name} is listening
                </h2>
                <p className="mt-1.5 max-w-sm text-balance text-[12px] leading-relaxed text-neutral-500">
                  Ask anything. You will get their instinct, their reasoning, and then their answer.
                </p>

                <div className="mt-6 grid w-full max-w-md gap-1.5">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => {
                        setInput(suggestion);
                        textareaRef.current?.focus();
                      }}
                      className="group flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-left transition-colors hover:border-cyan-500/30 hover:bg-cyan-500/[0.04]"
                    >
                      <IconSpark size={13} className="shrink-0 text-neutral-600 group-hover:text-cyan-400" />
                      <span className="text-[12px] text-neutral-400 group-hover:text-neutral-200">{suggestion}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-5 sm:space-y-6">
              {messages.map((message) => (
                <MessageCard
                  key={message.id}
                  message={message}
                  persona={userProfile.name}
                  isLastClone={message.id === lastCloneId && !isProcessing}
                  expanded={expandedIds.has(message.id)}
                  onToggle={() =>
                    setExpandedIds((previous) => {
                      const next = new Set(previous);
                      if (next.has(message.id)) next.delete(message.id);
                      else next.add(message.id);
                      return next;
                    })
                  }
                  onCopy={copy}
                  onExport={(item) =>
                    downloadFile(item.content, `duet-${item.role.toLowerCase()}-${item.id}.md`, 'text/markdown')
                  }
                  onRegenerate={regenerate}
                  onOpenImage={setSelectedImage}
                  onRetry={retryLast}
                />
              ))}

              {isProcessing && <DraftCard state={draft} />}

              {error && !isProcessing && (
                <div className="flex items-start gap-2.5 rounded-xl border border-red-500/25 bg-red-500/[0.05] px-3.5 py-3 text-[12px] leading-relaxed text-red-300">
                  <IconWarn size={15} className="mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p>{error}</p>
                    <button
                      onClick={onOpenSettings}
                      className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-red-200 underline underline-offset-4 hover:text-white"
                    >
                      check connection
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* Composer */}
        <div className="shrink-0 border-t border-white/[0.06] bg-[#050505]/95 px-2.5 pb-2.5 pt-2.5 backdrop-blur-xl sm:px-4 sm:pb-4">
          <div className="mx-auto w-full max-w-3xl">
            {commandMatches.length > 0 && (
              <div className="mb-2 overflow-hidden rounded-xl border border-violet-500/25 bg-[#0c0a12] p-1.5 shadow-3xl animate-fade-in">
                {commandMatches.map((command) => (
                  <button
                    key={command.name}
                    onClick={() => {
                      setInput(`/${command.name} `);
                      textareaRef.current?.focus();
                    }}
                    className="flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06]"
                  >
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-violet-300">
                      /{command.name}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11.5px] leading-relaxed text-neutral-300">
                        {command.description}
                      </span>
                      <span className="mt-0.5 block font-mono text-[9px] text-neutral-600">{command.usage}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {activeCommand && (
              <div className="mb-2 flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/[0.06] px-3 py-2">
                <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-violet-400" />
                <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.18em] text-violet-300">
                  {activeCommand.label}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-500">
                  {activeCommand.url}
                </span>
                <button
                  onClick={exitCommand}
                  className="shrink-0 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-neutral-400 hover:border-white/20 hover:text-white"
                >
                  exit
                </button>
              </div>
            )}

            {pendingAttachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {pendingAttachments.map((attachment, index) => (
                  <div
                    key={`${attachment.name}-${index}`}
                    className="group relative h-14 w-14 overflow-hidden rounded-lg border border-white/10"
                  >
                    <img
                      src={`data:${attachment.mimeType};base64,${attachment.data}`}
                      alt={attachment.name || 'attachment'}
                      className="h-full w-full object-cover"
                    />
                    <button
                      onClick={() =>
                        setPendingAttachments((previous) => previous.filter((_, itemIndex) => itemIndex !== index))
                      }
                      aria-label="Remove attachment"
                      className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/80 text-neutral-300 hover:text-white"
                    >
                      <IconX size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div
              className={`flex items-end gap-1.5 rounded-2xl border bg-[#0b0b0b] p-1.5 transition-colors ${
                isPaused
                  ? 'border-amber-500/25 opacity-70'
                  : 'border-white/10 focus-within:border-cyan-500/40'
              }`}
            >
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isPaused || isProcessing}
                aria-label="Attach image"
                title="Attach image"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-neutral-500 transition-colors hover:bg-white/[0.06] hover:text-cyan-300 disabled:opacity-30"
              >
                <IconPlus size={17} />
              </button>

              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  const element = event.target;
                  element.style.height = 'auto';
                  element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={
                  isPaused
                    ? 'Link paused — resume to speak'
                    : activeCommand
                      ? 'Answer in character — one bounded question per turn…'
                      : `Message ${userProfile.name}… or type /forge <url>`
                }
                disabled={isPaused}
                aria-label="Message"
                className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-1 py-2 text-[14px] leading-relaxed text-white placeholder-neutral-600 focus:outline-none disabled:opacity-50"
              />

              <button
                onClick={isLive ? stopLive : startLive}
                disabled={isPaused}
                aria-label="Voice link"
                title={isLive ? 'Stop voice' : 'Start voice link (Gemini)'}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-30 ${
                  isLive
                    ? 'animate-pulse bg-red-500/20 text-red-400'
                    : 'text-neutral-500 hover:bg-white/[0.06] hover:text-cyan-300'
                }`}
              >
                <IconMic size={16} />
              </button>

              {isProcessing ? (
                <button
                  onClick={stop}
                  aria-label="Stop generating"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20"
                >
                  <IconStop size={14} />
                </button>
              ) : (
                <button
                  onClick={() => void send()}
                  disabled={isPaused || (!input.trim() && pendingAttachments.length === 0)}
                  aria-label="Send message"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400 text-black transition-all hover:bg-cyan-300 active:scale-95 disabled:opacity-25"
                >
                  <IconSend size={16} />
                </button>
              )}
            </div>

            <div className="mt-1.5 flex items-center justify-between px-1 font-mono text-[8.5px] uppercase tracking-[0.14em] text-neutral-700">
              <span className="truncate">
                {activeCommand ? '/forge exit to leave the command · shift+enter newline' : 'enter to send · /forge <url> · shift+enter newline'}
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className={`h-1 w-1 rounded-full ${accent.dot}`} />
                {meta.short}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Image lightbox */}
      <Modal open={!!selectedImage} onClose={() => setSelectedImage(null)} wide className="bg-black/95">
        {selectedImage && (
          <div className="flex flex-col items-center gap-4 p-4 sm:p-6">
            <img
              src={`data:${selectedImage.mimeType};base64,${selectedImage.data}`}
              alt={selectedImage.name || 'visualisation'}
              className="max-h-[68vh] w-auto rounded-xl border border-white/10 object-contain"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                icon={<IconDownload size={14} />}
                onClick={() => {
                  const binary = atob(selectedImage.data);
                  const bytes = new Uint8Array(binary.length);
                  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
                  const url = URL.createObjectURL(new Blob([bytes], { type: selectedImage.mimeType }));
                  const anchor = document.createElement('a');
                  anchor.href = url;
                  anchor.download = selectedImage.name || 'duet-image.png';
                  anchor.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                Download
              </Button>
              <Button variant="ghost" onClick={() => setSelectedImage(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Node injection */}
      <Modal open={nodeModal} onClose={() => setNodeModal(false)} labelledBy="node-title">
        <div className="p-5 sm:p-6">
          <h3 id="node-title" className="font-display text-xl font-semibold text-white">
            Inject context
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed text-neutral-500">
            Give the clone something to read. Links are summarised, text is used verbatim.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl border border-white/[0.06] bg-black/40 p-1.5">
            {(['link', 'text', 'file'] as ContextNodeType[]).map((type) => {
              const Icon = type === 'link' ? IconLink : type === 'text' ? IconText : IconFile;
              return (
                <button
                  key={type}
                  onClick={() => setNodeType(type)}
                  className={`flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors ${
                    nodeType === type ? 'bg-white/[0.09] text-white' : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  <Icon size={13} /> {type}
                </button>
              );
            })}
          </div>

          <div className="mt-4 space-y-3">
            <Field label="Label" hint={<span className="font-mono text-[9px] text-neutral-600">optional</span>}>
              <input
                value={nodeTitle}
                onChange={(event) => setNodeTitle(event.target.value)}
                placeholder={nodeType === 'link' ? 'Fetched automatically' : 'e.g. Founder letter 2019'}
                className={inputClass}
              />
            </Field>

            {nodeType === 'file' ? (
              <button
                onClick={() => nodeFileInputRef.current?.click()}
                className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-white/15 py-10 text-neutral-500 transition-colors hover:border-cyan-500/40 hover:bg-cyan-500/[0.03] hover:text-cyan-300"
              >
                <IconFile size={20} />
                <span className="font-mono text-[10px] uppercase tracking-[0.18em]">choose a file</span>
              </button>
            ) : (
              <Field label={nodeType === 'link' ? 'URL' : 'Content'}>
                {nodeType === 'link' ? (
                  <input
                    value={nodeValue}
                    onChange={(event) => setNodeValue(event.target.value)}
                    placeholder="https://…"
                    className={`${inputClass} font-mono`}
                  />
                ) : (
                  <textarea
                    value={nodeValue}
                    onChange={(event) => setNodeValue(event.target.value)}
                    placeholder="Paste a passage, a belief, a manifesto…"
                    className={`${inputClass} h-36 resize-none leading-relaxed`}
                  />
                )}
              </Field>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <Button
              variant="primary"
              full
              disabled={nodeType !== 'file' && !nodeValue.trim()}
              onClick={() => nodeType !== 'file' && addContextNode(nodeType, nodeTitle, nodeValue)}
              icon={nodeType === 'link' ? <IconGlobe size={14} /> : <IconZap size={14} />}
            >
              {nodeType === 'link' ? 'Fetch and add' : 'Add node'}
            </Button>
            <Button variant="ghost" onClick={() => setNodeModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAttach}
        className="hidden"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
      />
      <input type="file" ref={nodeFileInputRef} onChange={handleNodeFile} className="hidden" />
    </div>
  );
};
