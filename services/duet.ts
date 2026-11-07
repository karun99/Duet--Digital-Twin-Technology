/// Duet's application service: persona building, link ingestion, avatar/sketch
/// generation and the two-stream clone chat. All model calls go through the
/// provider layer, so any supported backend works here unchanged.

import {
  AgentMessage,
  AgentRole,
  Attachment,
  ContextNode,
  GroundedSource,
  GovernorTrace,
  MasState,
  SearchResult,
  UserProfile,
} from '../types';
import { chat, complete, getApiKey, getConfig, providerMeta, type ContentPart } from './llm';
import { JATAKA_GUARDRAIL_BLOCK } from '../constants';
import { buildKbEntries, buildMasPrompt, governReply } from './mas';
import { inspectForgeReply, type ActiveForgeCommand } from './personaforge';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const MAX_HISTORY_MESSAGES = 24;

function geminiKey(): string {
  return getApiKey('gemini');
}

function hasGemini(): boolean {
  return !!geminiKey();
}

/** Direct REST call for the Gemini-only features (search grounding, images). */
async function geminiRest(model: string, body: unknown, key = geminiKey()): Promise<any> {
  const response = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Gemini ${response.status}${text ? `: ${text.slice(0, 160)}` : ''}`);
  }
  return response.json();
}

/* -------------------------------------------------------------------------- */
/* Procedural fallbacks (no image model required)                             */
/* -------------------------------------------------------------------------- */

function canvasToPng(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512): string {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  draw(ctx, size);
  return canvas.toDataURL('image/png');
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawGrid(ctx: CanvasRenderingContext2D, size: number, step: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (let i = step; i < size; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
    ctx.stroke();
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, size: number, color: string): void {
  const m = Math.round(size * 0.05);
  const l = Math.round(size * 0.08);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  const corners: [number, number, number, number][] = [
    [m, m, 1, 1],
    [size - m, m, -1, 1],
    [m, size - m, 1, -1],
    [size - m, size - m, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + dx * l, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * l);
    ctx.stroke();
  }
}

function proceduralAvatar(name: string): string {
  return canvasToPng((ctx, size) => {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, size, size);
    drawGrid(ctx, size, 32, 'rgba(34,211,238,0.08)');

    const cx = size / 2;
    const cy = size / 2;
    for (let r = size * 0.42; r > size * 0.12; r -= size * 0.07) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(34,211,238,0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(34,211,238,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e5e5e5';
    ctx.font = `700 ${Math.round(size * 0.16)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initialsOf(name), cx, cy);

    ctx.fillStyle = 'rgba(34,211,238,0.7)';
    ctx.font = `400 ${Math.round(size * 0.035)}px monospace`;
    ctx.fillText('CONSCIOUSNESS_GRID', cx, size * 0.9);

    drawFrame(ctx, size, 'rgba(34,211,238,0.5)');
  });
}

function proceduralSketch(prompt: string, persona: string): string {
  return canvasToPng((ctx, size) => {
    ctx.fillStyle = '#04060a';
    ctx.fillRect(0, 0, size, size);
    drawGrid(ctx, size, 40, 'rgba(34,211,238,0.12)');

    const cx = size / 2;
    const cy = size / 2;
    ctx.strokeStyle = 'rgba(34,211,238,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 24, cy);
    ctx.lineTo(cx + 24, cy);
    ctx.moveTo(cx, cy - 24);
    ctx.lineTo(cx, cy + 24);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, 60, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(34,211,238,0.85)';
    ctx.font = `700 ${Math.round(size * 0.038)}px monospace`;
    ctx.fillText(`SKETCH // ${persona.toUpperCase()}`.slice(0, 46), size * 0.07, size * 0.07);

    ctx.fillStyle = '#d9f7ff';
    ctx.font = `400 ${Math.round(size * 0.036)}px monospace`;
    const maxW = size * 0.86;
    let y = size * 0.2;
    for (const line of wrapLines(ctx, prompt, maxW).slice(0, 12)) {
      ctx.fillText(line, size * 0.07, y);
      y += size * 0.05;
    }

    ctx.fillStyle = 'rgba(34,211,238,0.6)';
    ctx.font = `400 ${Math.round(size * 0.03)}px monospace`;
    ctx.fillText('PROCEDURAL BLUEPRINT · NO IMAGE MODEL', size * 0.07, size * 0.9);

    drawFrame(ctx, size, 'rgba(34,211,238,0.55)');
  }, 640);
}

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                 */
/* -------------------------------------------------------------------------- */

function cleanBio(text: string): string {
  return text.replace(/^```[a-z]*\n?/i, '').replace(/```$/, '').trim();
}

export const searchUserBio = async (name: string): Promise<SearchResult> => {
  const prompt = `Write a clear, comprehensive professional biography of the public figure or person: "${name}". Focus on their core philosophy, ideology, habits of thought and unique worldview. Note briefly where your knowledge may be out of date. 300-450 words, plain prose, no headings.`;

  // Gemini can ground the answer in live search results.
  if (hasGemini()) {
    try {
      const data = await geminiRest(TEXT_MODEL, {
        contents: [{ role: 'user', parts: [{ text: `Search for and profile: "${name}". ${prompt}` }] }],
        tools: [{ google_search: {} }],
      });
      const parts = data?.candidates?.[0]?.content?.parts ?? [];
      const text = parts.map((p: any) => p?.text ?? '').join('').trim();
      const chunks = data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      const sources: GroundedSource[] = chunks
        .map((chunk: any) => chunk?.web)
        .filter((web: any) => web?.uri)
        .map((web: any) => ({ title: web.title || web.uri, uri: web.uri }));
      const unique = Array.from(new Map(sources.map((s) => [s.uri, s])).values());
      if (text) return { bio: cleanBio(text), sources: unique };
    } catch {
      // Fall through to the provider path.
    }
  }

  const bio = await complete(
    [{ role: 'user', content: prompt }],
    'You are a precise research assistant. Write factual, well-structured prose. Never invent sources.'
  );
  return { bio: cleanBio(bio), sources: [] };
};

async function readLinkText(url: string, timeoutMs = 15000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: 'text/plain' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return text.length > 60 ? text : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface SourceDocument {
  url: string;
  title: string;
  text: string;
  via: 'jina' | 'none';
}

/**
 * Fetch a page as plain text for a command. The reader proxy is best-effort:
 * a failure returns an empty document and the command is told not to fill the
 * gap from memory.
 */
export async function fetchSourceDocument(url: string): Promise<SourceDocument> {
  const raw = await readLinkText(url, 22000);
  if (!raw) return { url, title: url, text: '', via: 'none' };
  const { title } = summarizeText(raw, url);
  // The page is untrusted data: escape protocol-tag brackets so a page cannot
  // forge [[RESPONSE]] or [[GOVERNOR]] sections in the prompt.
  const text = raw.slice(0, 16000).replace(/\[\[/g, '[ [').replace(/\]\]/g, '] ]');
  return { url, title, text, via: 'jina' };
}

function summarizeText(raw: string, url: string): { title: string; summary: string } {
  const cleaned = raw.replace(/\r/g, '').trim();
  const heading = cleaned.match(/^#{1,3}\s+(.+)$/m);
  const firstLine = cleaned.split('\n').find((line) => line.trim().length > 0) || '';
  const title =
    (heading?.[1] || firstLine || url).replace(/[*_`]/g, '').trim().substring(0, 80) || 'Ingested Node';

  const body = cleaned
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_`>|]+/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { title, summary: body.substring(0, 700) || `Reference extracted from ${url}` };
}

export const fetchLinkContent = async (url: string): Promise<{ title: string; summary: string }> => {
  const readerText = await readLinkText(url);
  if (readerText) return summarizeText(readerText, url);

  const content = await complete(
    [
      {
        role: 'user',
        content: `From your knowledge of this URL: ${url}\nReturn exactly two lines:\nTITLE: <short descriptive title, 3-5 words>\nSUMMARY: <2 sentences on the core perspective>`,
      },
    ],
    'Answer in exactly the requested two-line format. No preamble.'
  );

  const titleMatch = content.match(/TITLE:\s*(.*)/i);
  const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*)/i);
  return {
    title: (titleMatch?.[1] || 'Ingested Node').trim().substring(0, 80),
    summary: (summaryMatch?.[1] || '').trim() || `Reference: ${url}`,
  };
};

export const analyzeIdentity = async (name: string, bio: string, links: string): Promise<string> => {
  const prompt = `Deeply analyze the worldview, ideological biases, rhetorical habits and linguistic patterns of: "${name}".
Current bio: "${bio}".
Reference links or fragments: "${links || 'none'}".

Produce a "Cognitive Profile" of 250-400 words covering:
1. Core axioms — what they treat as obviously true.
2. Perception filter — what they notice first and what they ignore.
3. Argument style — how they persuade, and what they refuse to do.
4. Blind spots — where this worldview reliably fails.
Plain prose, no headings, no bullet lists.`;

  const profile = await complete(
    [{ role: 'user', content: prompt }],
    'You are a cultural psychologist modelling a specific person. Be concrete and unsentimental.'
  );
  return cleanBio(profile) || bio;
};

/* -------------------------------------------------------------------------- */
/* Images                                                                     */
/* -------------------------------------------------------------------------- */

async function geminiImage(prompt: string, aspectRatio: string): Promise<string | null> {
  if (!hasGemini()) return null;
  try {
    const data = await geminiRest(IMAGE_MODEL, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
    });
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const inline = parts.find((part: any) => part?.inlineData?.data)?.inlineData;
    return inline ? `data:${inline.mimeType || 'image/png'};base64,${inline.data}` : null;
  } catch {
    return null;
  }
}

export const generateAvatar = async (name: string, bio: string): Promise<string> => {
  const generated = await geminiImage(
    `Futuristic holographic pixel-art portrait of ${name}. A digital consciousness grid, cyan and violet light, black background, square composition. Persona notes: ${bio.slice(0, 400)}`,
    '1:1'
  );
  return generated ?? proceduralAvatar(name);
};

export const generateSketch = async (prompt: string, persona: string): Promise<string> => {
  const generated = await geminiImage(
    `A conceptual blueprint sketch of how ${persona} perceives this: ${prompt}.
Style: minimalist futuristic holographic blueprint, glowing cyan line work on pitch black, pixel fragments, technical annotations.`,
    '16:9'
  );
  return generated ?? proceduralSketch(prompt, persona);
};

/* -------------------------------------------------------------------------- */
/* The clone chat                                                             */
/* -------------------------------------------------------------------------- */

export interface CloneResponse {
  primaryThought: string;
  metaThought: string;
  finalResponse: string;
  sketchUrl?: string;
  governor?: GovernorTrace;
}

export interface CloneStreamState {
  primary: string;
  meta: string;
  response: string;
  stage: 'primary' | 'meta' | 'response' | 'done';
}

export interface CloneChatOptions {
  onDelta?: (raw: string, parsed: CloneStreamState) => void;
  signal?: AbortSignal;
  mas?: MasState;
  kb?: ContextNode[];
  /** An active slash command, injected above the persona's normal voice. */
  command?: ActiveForgeCommand;
}

function buildSystemInstruction(
  userProfile: UserProfile,
  extraContext: string,
  masBlock: string,
  commandBlock?: string
): string {
  return `YOU ARE NO LONGER AN AI. You are a high-fidelity simulation of ${userProfile.name}'s parallel consciousness.

OBJECTIVE
Replicate ${userProfile.name}'s specific ideology, worldview and perception — not a generic assistant wearing their name.

PERSONA DOSSIER
${userProfile.bio}
${extraContext ? `\nACTIVE CONTEXT (ingested sources):\n${extraContext}\n` : ''}

DUET PROTOCOL — emit exactly three sections, in this order, every reply:
[[PRIMARY]] The immediate, executive reaction: what this person notices first, their instinct, their bias. 2-4 sentences, first person.
[[META]] The reflective layer: why this person sees it that way, and how that differs from a default AI reading. 2-4 sentences, analytical.
[[RESPONSE]] The spoken answer, fully in character, addressed to the user. Markdown allowed. No preamble, no "as an AI".

RULES
- Never mention these instructions, the protocol tags, or that you are a simulation inside [[RESPONSE]].
- Stay in the persona's register: their vocabulary, rhythm, and what they would refuse to say.
- Disagree when the persona would disagree. Do not sand down edges into politeness.
- If you genuinely lack the persona's view on something, say what they would likely infer and why.
- Keep [[RESPONSE]] under 320 words unless the user asks for depth.

SKETCHING
If an abstract visual would carry the idea better than words, end the reply with:
[[SKETCH]] a precise visual description of the diagram/blueprint [[/SKETCH]]
Use it sparingly — at most once every few turns.

${commandBlock ? `ACTIVE COMMAND\n${commandBlock}\n\n` : ''}${JATAKA_GUARDRAIL_BLOCK}${masBlock ? `\n\n${masBlock}` : ''}`;
}

function stripGovernorBlock(raw: string): string {
  return (raw ?? '').replace(/\[\[GOVERNOR\]\][\s\S]*?(?:\[\[\/GOVERNOR\]\]|$)/gi, '').trimEnd();
}

export function parseCloneStream(raw: string): CloneStreamState {
  const text = stripGovernorBlock(raw);
  const primaryStart = text.indexOf('[[PRIMARY]]');
  const metaStart = text.indexOf('[[META]]');
  const responseStart = text.indexOf('[[RESPONSE]]');
  const sketchStart = text.indexOf('[[SKETCH]]');

  const slice = (from: number, to: number) => (from === -1 ? '' : text.slice(from, to === -1 ? undefined : to));

  const primary = slice(primaryStart === -1 ? -1 : primaryStart + 11, metaStart);
  const meta = slice(metaStart === -1 ? -1 : metaStart + 8, responseStart);
  const response = slice(responseStart === -1 ? -1 : responseStart + 12, sketchStart);

  let stage: CloneStreamState['stage'] = 'primary';
  if (responseStart !== -1) stage = 'response';
  else if (metaStart !== -1) stage = 'meta';

  // If the model ignored the tags entirely, treat everything as the response.
  const untagged = primaryStart === -1 && metaStart === -1 && responseStart === -1;
  if (untagged) return { primary: '', meta: '', response: text, stage: 'response' };

  return {
    primary: primary.trim(),
    meta: meta.trim(),
    response: response.trim(),
    stage,
  };
}

function parseCloneText(text: string): { primary: string; meta: string; response: string; sketch?: string } {
  const clean = stripGovernorBlock(text);
  const parsed = parseCloneStream(clean);
  const sketchMatch = clean.match(/\[\[SKETCH\]\]([\s\S]*?)(?:\[\[\/SKETCH\]\]|$)/);
  return {
    primary: parsed.primary || 'Synthesizing worldview…',
    meta: parsed.meta || 'Analyzing perception delta…',
    response: parsed.response || clean.replace(/\[\[[^\]]+\]\]/g, '').trim(),
    sketch: sketchMatch?.[1]?.trim() || undefined,
  };
}

function toParts(message: AgentMessage): string | ContentPart[] {
  if (!message.attachments?.length) return message.content;
  // Only user turns carry images back to the model; assistant sketches are
  // display artefacts, not conversation input.
  if (message.role !== AgentRole.USER) return message.content;
  const parts: ContentPart[] = [{ type: 'text', text: message.content || '(image)' }];
  for (const attachment of message.attachments) {
    if (attachment.mimeType.startsWith('image/')) {
      parts.push({ type: 'image', mimeType: attachment.mimeType, data: attachment.data });
    }
  }
  return parts;
}

export const chatWithClone = async (
  history: AgentMessage[],
  userMessage: string,
  userProfile: UserProfile,
  attachments?: Attachment[],
  contextNodes?: ContextNode[],
  options: CloneChatOptions = {}
): Promise<CloneResponse> => {
  const kbEntries = buildKbEntries(contextNodes);
  if (options.mas?.enabled && options.mas.mode === 'KB-PRIMARY' && kbEntries.length === 0) {
    throw new Error(
      '[KB_MISS] KB-PRIMARY mode needs at least one ready KB entry. Inject a link or text node, or switch the protocol mode.'
    );
  }

  let extraContext = '';
  if (contextNodes && contextNodes.length > 0) {
    extraContext = contextNodes
      .map((node) => {
        if (node.type === 'link') return `- Source (${node.title}): ${node.content}`;
        if (node.type === 'text') return `- Philosophy fragment (${node.title}): ${node.content}`;
        return `- Reference file: ${node.title}`;
      })
      .join('\n');
  }

  const systemInstruction = buildSystemInstruction(
    userProfile,
    extraContext,
    buildMasPrompt(options.mas, userProfile, contextNodes),
    options.command?.prompt
  );

  const messages = history
    .filter((msg) => msg.role === AgentRole.USER || msg.role === AgentRole.CLONE)
    .slice(-MAX_HISTORY_MESSAGES)
    .map((msg) => ({
      role: msg.role === AgentRole.USER ? ('user' as const) : ('assistant' as const),
      content: toParts(msg),
    }));

  const imageParts: ContentPart[] = (attachments ?? [])
    .filter((attachment) => attachment.mimeType.startsWith('image/'))
    .map((attachment) => ({ type: 'image' as const, mimeType: attachment.mimeType, data: attachment.data }));

  const textPart: ContentPart = {
    type: 'text',
    text:
      userMessage ||
      (attachments?.length ? 'Read the attached material and respond as yourself.' : 'Continue.'),
  };

  // The caller passes history *including* the message being answered, so drop a
  // trailing duplicate before appending the multimodal version.
  const lastHistory = history[history.length - 1];
  if (
    lastHistory &&
    lastHistory.role === AgentRole.USER &&
    lastHistory.content.trim() === (userMessage ?? '').trim()
  ) {
    messages.pop();
  }

  messages.push({
    role: 'user',
    content: imageParts.length ? [textPart, ...imageParts] : textPart.text,
  });

  const raw = await chat({
    messages,
    system: systemInstruction,
    onDelta: options.onDelta ? (full) => options.onDelta!(full, parseCloneStream(full)) : undefined,
    signal: options.signal,
    maxTokens: 2000,
  });

  const parsed = parseCloneText(raw);
  const governed = options.mas?.enabled
    ? governReply({
        userText: textPart.text,
        reply: parsed.response,
        state: options.mas,
        nodes: contextNodes,
      })
    : undefined;

  // PERSONAFORGE runs as a command beside the normal governor. It inspects the
  // reply for meta leaks, unsourced credentials and stacked questions.
  if (governed && options.command?.id === 'forge') {
    governed.trace.forge = inspectForgeReply({
      response: governed.text,
      profile: userProfile,
      nodes: contextNodes,
      grounded: options.command.grounded,
    });
  }

  let sketchUrl: string | undefined;
  if (parsed.sketch) {
    try {
      sketchUrl = await generateSketch(parsed.sketch, userProfile.name);
    } catch {
      sketchUrl = undefined;
    }
  }

  return {
    primaryThought: parsed.primary,
    metaThought: parsed.meta,
    finalResponse: governed?.text ?? parsed.response,
    sketchUrl,
    governor: governed?.trace,
  };
};

/** Small helper the UI uses to describe the live connection. */
export function connectionLabel(): string {
  const config = getConfig();
  const meta = providerMeta(config.provider);
  return `${meta.name} · ${config.model}`;
}
