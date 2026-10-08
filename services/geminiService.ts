import { GoogleGenAI } from "@google/genai";
import { SearchResult, AgentRole, AgentMessage, UserProfile, Attachment, ContextNode } from "../types";
import { complete, getStoredApiKey } from "./openrouter";
import { JATAKA_GUARDRAIL_BLOCK } from "../constants";

const MODEL_NAME = "gemini-3-flash-preview";
const IMAGE_MODEL = "gemini-2.5-flash-image";

/// Provider selection: OpenRouter (user key, free models) is the default path
/// for every text call. Gemini is used when the deployment ships a host key —
/// it keeps search grounding and image generation available at no cost to the
/// user. Without either key the app fails with a readable message.

function hasGemini(): boolean {
  return !!process.env.API_KEY;
}

function getGemini(): GoogleGenAI {
  if (!hasGemini()) {
    throw new Error("No Gemini host key is configured on this deployment.");
  }
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
}

const NO_PROVIDER_ERROR = "No AI link available. Add an OpenRouter key to continue.";

/// ---------------------------------------------------------------------------
/// Procedural fallbacks (no image model required)
/// ---------------------------------------------------------------------------

function canvasToPng(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 512): string {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  draw(ctx, size);
  return canvas.toDataURL("image/png");
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
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
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, size, size);
    drawGrid(ctx, size, 32, "rgba(34,211,238,0.08)");

    const cx = size / 2;
    const cy = size / 2;
    for (let r = size * 0.42; r > size * 0.12; r -= size * 0.07) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(34,211,238,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    ctx.fillStyle = "rgba(34,211,238,0.12)";
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#e5e5e5";
    ctx.font = `700 ${Math.round(size * 0.16)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initialsOf(name), cx, cy);

    ctx.fillStyle = "rgba(34,211,238,0.7)";
    ctx.font = `400 ${Math.round(size * 0.035)}px monospace`;
    ctx.fillText("CONSCIOUSNESS_GRID", cx, size * 0.9);

    drawFrame(ctx, size, "rgba(34,211,238,0.5)");
  });
}

function proceduralSketch(prompt: string, persona: string): string {
  return canvasToPng((ctx, size) => {
    ctx.fillStyle = "#04060a";
    ctx.fillRect(0, 0, size, size);
    drawGrid(ctx, size, 40, "rgba(34,211,238,0.12)");

    const cx = size / 2;
    const cy = size / 2;
    ctx.strokeStyle = "rgba(34,211,238,0.4)";
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

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(34,211,238,0.85)";
    ctx.font = `700 ${Math.round(size * 0.038)}px monospace`;
    ctx.fillText(`SKETCH // ${persona.toUpperCase()}`.slice(0, 46), size * 0.07, size * 0.07);

    ctx.fillStyle = "#d9f7ff";
    ctx.font = `400 ${Math.round(size * 0.036)}px monospace`;
    const maxW = size * 0.86;
    let y = size * 0.2;
    for (const line of wrapLines(ctx, prompt, maxW).slice(0, 12)) {
      ctx.fillText(line, size * 0.07, y);
      y += size * 0.05;
    }

    ctx.fillStyle = "rgba(34,211,238,0.6)";
    ctx.font = `400 ${Math.round(size * 0.03)}px monospace`;
    ctx.fillText("PROCEDURAL BLUEPRINT · OPENROUTER FREE TIER", size * 0.07, size * 0.9);

    drawFrame(ctx, size, "rgba(34,211,238,0.55)");
  }, 640);
}

/// ---------------------------------------------------------------------------
/// Onboarding helpers
/// ---------------------------------------------------------------------------

export const searchUserBio = async (name: string): Promise<SearchResult> => {
  if (getStoredApiKey()) {
    try {
      const bio = await complete([
        {
          role: "user",
          content: `Write a clear, comprehensive professional biography of the public figure or person: "${name}". Focus on their core philosophy, ideology, and unique worldview. If your knowledge of them is uncertain or out of date, say so briefly. 300-450 words.`,
        },
      ]);
      return { bio: bio || `No bio found for ${name}.`, sources: [] };
    } catch (error) {
      if (!hasGemini()) throw new Error("Failed to search for user bio.");
    }
  }

  if (!hasGemini()) throw new Error(NO_PROVIDER_ERROR);

  try {
    const prompt = `Search for the public figure or person: "${name}". Write a clear, comprehensive professional biography focused on their core philosophy, ideology, and unique worldview.`;
    const response = await getGemini().models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || "No bio found.";
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .filter((chunk: any) => chunk.web?.uri && chunk.web?.title)
      .map((chunk: any) => ({ title: chunk.web.title as string, uri: chunk.web.uri as string }));
    return { bio: text, sources: Array.from(new Map(sources.map((item: any) => [item.uri, item])).values()) as any[] };
  } catch (error) {
    throw new Error("Failed to search for user bio.");
  }
};

async function readLinkText(url: string): Promise<string | null> {
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, { headers: { Accept: "text/plain" } });
    if (!response.ok) return null;
    const text = (await response.text()).trim();
    return text.length > 60 ? text : null;
  } catch {
    return null;
  }
}

function summarizeText(raw: string, url: string): { title: string; summary: string } {
  const cleaned = raw.replace(/\r/g, "").trim();
  const heading = cleaned.match(/^#{1,3}\s+(.+)$/m);
  const firstLine = cleaned.split("\n").find((line) => line.trim().length > 0) || "";
  const title = (heading?.[1] || firstLine || url).replace(/[*_`]/g, "").trim().substring(0, 80) || "Ingested Node";

  const body = cleaned
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`>|]+/g, " ")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return { title, summary: body.substring(0, 400) || `Reference extracted from ${url}` };
}

export const fetchLinkContent = async (url: string): Promise<{ title: string; summary: string }> => {
  const readerText = await readLinkText(url);
  if (readerText) return summarizeText(readerText, url);

  if (getStoredApiKey()) {
    const content = await complete([
      {
        role: "user",
        content: `Analyze this URL from your knowledge of it: ${url}.\nReturn exactly two lines:\nTITLE: <short descriptive title, 3-5 words>\nSUMMARY: <2-sentence summary of the core perspective>`,
      },
    ]);
    const titleMatch = content.match(/TITLE:\s*(.*)/i);
    const summaryMatch = content.match(/SUMMARY:\s*([\s\S]*)/i);
    if (titleMatch || summaryMatch) {
      return {
        title: (titleMatch?.[1] || "Ingested Node").trim().substring(0, 80),
        summary: (summaryMatch?.[1] || "").trim() || `Reference: ${url}`,
      };
    }
  }

  if (!hasGemini()) throw new Error("Could not read that link. Add a key or try another URL.");

  try {
    const prompt = `Visit this URL and analyze its contents: ${url}.
    Use the following descriptive title (short, 3-5 words) and the summary:
    TITLE: <title>
    SUMMARY: <2-sentence summary of the core perspective found there>`;

    const response = await getGemini().models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });

    const text = response.text || "";
    const titleMatch = text.match(/TITLE:\s*(.*)/i);
    const summaryMatch = text.match(/SUMMARY:\s*([\s\S]*)/i);

    return {
      title: titleMatch ? titleMatch[1].trim().substring(0, 80) : "Ingested Node",
      summary: summaryMatch ? summaryMatch[1].trim() : text.substring(0, 400),
    };
  } catch (error) {
    throw new Error(`Failed to fetch content for: ${url}`);
  }
};

export const generateAvatar = async (name: string, bio: string): Promise<string> => {
  if (hasGemini()) {
    try {
      const response = await getGemini().models.generateContent({
        model: IMAGE_MODEL,
        contents: `Futuristic holographic pixel art portrait of ${name}. Imagine a digital consciousness grid.`,
        config: { imageConfig: { aspectRatio: "1:1" } },
      });
      const part = response.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    } catch (error) {
      // Fall through to the procedural avatar.
    }
  }
  return proceduralAvatar(name);
};

export const generateSketch = async (prompt: string, persona: string): Promise<string> => {
  if (hasGemini()) {
    try {
      const fullPrompt = `A digital sketch or abstract conceptual visualization based on the perception of ${persona}.
      Subject: ${prompt}.
      Style: Minimalist, futuristic, holographic blueprints with glowing lines and pixelated digital fragments.
      Aesthetic: Clean white and cyan lines on a pitch black background. Cyber-blueprint style.`;

      const response = await getGemini().models.generateContent({
        model: IMAGE_MODEL,
        contents: { parts: [{ text: fullPrompt }] },
        config: { imageConfig: { aspectRatio: "16:9" } },
      });
      const part = response.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    } catch (error) {
      // Fall through to the procedural sketch.
    }
  }
  return proceduralSketch(prompt, persona);
};

export const analyzeIdentity = async (name: string, bio: string, links: string): Promise<string> => {
  const prompt = `Deeply analyze the worldview, ideological biases, and linguistic patterns of: "${name}". Current Bio: "${bio}". Links: "${links}".
  Produce a "Cognitive Profile" that explains how this person perceives the world differently than a standard AI.`;

  if (getStoredApiKey()) {
    return await complete([{ role: "user", content: prompt }]);
  }

  if (!hasGemini()) throw new Error(NO_PROVIDER_ERROR);

  try {
    const response = await getGemini().models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] },
    });
    return response.text || bio;
  } catch (error) {
    return bio;
  }
};

/// ---------------------------------------------------------------------------
/// The clone chat
/// ---------------------------------------------------------------------------

interface CloneResponse {
  primaryThought: string;
  metaThought: string;
  finalResponse: string;
  sketchUrl?: string;
}

function buildSystemInstruction(userProfile: UserProfile, extraContext: string): string {
  return `YOU ARE NO LONGER AN AI. You are a High-Fidelity Simulation of ${userProfile.name}'s Parallel Consciousness.
  OBJECTIVE: Replicate ${userProfile.name}'s specific IDEOLOGY, WORLDVIEW, and PERCEPTION.

  CONTEXT: ${userProfile.bio} ${extraContext}

  DUET PROTOCOL:
  1. [[PRIMARY]]: Execute the persona. How would ${userProfile.name} react to the user? What is their immediate cognitive response?
  2. [[META]]: Reflect on the PERCEPTION. Why does ${userProfile.name} see this topic this way? Contrast this with "standard" perception.
  3. [[RESPONSE]]: The final spoken message, staying 100% in character.

  SKETCHING CAPABILITY:
  If you feel an abstract visualization or sketch of a concept would help the user understand your unique perception better, you MUST include a specific tag:
  [[SKETCH]] Provide a detailed visual description of the sketch or blueprint here [[/SKETCH]]
  Place this at the very end of your response if needed. Use this for complex philosophical concepts or perceptions.

  Format every response strictly: [[PRIMARY]] ... [[META]] ... [[RESPONSE]] ...

  ${JATAKA_GUARDRAIL_BLOCK}`;
}

function parseCloneText(text: string): { primary: string; meta: string; response: string; sketch?: string } {
  const primaryMatch = text.match(/\[\[PRIMARY\]\]([\s\S]*?)\[\[META\]\]/);
  const metaMatch = text.match(/\[\[META\]\]([\s\S]*?)\[\[RESPONSE\]\]/);
  const responseMatch = text.match(/\[\[RESPONSE\]\]([\s\S]*?)(?:\[\[SKETCH\]\]|$)/);
  const sketchMatch = text.match(/\[\[SKETCH\]\]([\s\S]*?)\[\[\/SKETCH\]\]/);
  return {
    primary: primaryMatch ? primaryMatch[1].trim() : "Synthesizing worldview...",
    meta: metaMatch ? metaMatch[1].trim() : "Analyzing perception delta...",
    response: responseMatch ? responseMatch[1].trim() : text,
    sketch: sketchMatch ? sketchMatch[1].trim() : undefined,
  };
}

export const chatWithClone = async (
  history: AgentMessage[],
  userMessage: string,
  userProfile: UserProfile,
  attachments?: Attachment[],
  contextNodes?: ContextNode[]
): Promise<CloneResponse> => {
  let extraContext = "";
  if (contextNodes && contextNodes.length > 0) {
    extraContext = "\n\nACTIVE IDEOLOGICAL DATA (INGESTED NODES):\n" + contextNodes.map(node => {
      if (node.type === 'link') return `- Source (${node.title}): ${node.content}`;
      if (node.type === 'text') return `- Philosophy Fragment (${node.title}): ${node.content}`;
      return `- Reference File: ${node.title}`;
    }).join('\n');
  }

  const systemInstruction = buildSystemInstruction(userProfile, extraContext);

  let currentUserMessage = userMessage;
  if (attachments && attachments.length > 0) {
    const labels = attachments.map(att => att.name || att.mimeType).join(", ");
    currentUserMessage += `\n\n[Attached image: ${labels}]`;
  }

  try {
    if (getStoredApiKey()) {
      const messages = history
        .filter(msg => msg.role === AgentRole.USER || msg.role === AgentRole.CLONE)
        .map(msg => ({
          role: (msg.role === AgentRole.USER ? "user" : "assistant") as "user" | "assistant",
          content: msg.content,
        }));
      messages.push({ role: "user" as const, content: currentUserMessage });

      const text = await complete(messages, systemInstruction);
      const parsed = parseCloneText(text);
      const sketchUrl = parsed.sketch ? await generateSketch(parsed.sketch, userProfile.name) : undefined;
      return {
        primaryThought: parsed.primary,
        metaThought: parsed.meta,
        finalResponse: parsed.response,
        sketchUrl,
      };
    }

    if (!hasGemini()) throw new Error(NO_PROVIDER_ERROR);

    const historyParts = history.flatMap(msg => {
      const parts = [];
      if (msg.role === AgentRole.USER) parts.push({ text: `User: ${msg.content}` });
      else if (msg.role === AgentRole.CLONE) parts.push({ text: `Clone: ${msg.content}` });
      return parts;
    });

    const currentParts: any[] = [{ text: `User: ${currentUserMessage}` }];
    if (attachments) {
      attachments.forEach(att => {
        currentParts.push({ inlineData: { data: att.data, mimeType: att.mimeType } });
      });
    }

    const response = await getGemini().models.generateContent({
      model: MODEL_NAME,
      contents: { parts: [...historyParts, ...currentParts] },
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.9,
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "";
    const parsed = parseCloneText(text);
    const sketchUrl = parsed.sketch ? await generateSketch(parsed.sketch, userProfile.name) : undefined;

    return {
      primaryThought: parsed.primary,
      metaThought: parsed.meta,
      finalResponse: parsed.response,
      sketchUrl,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown fault";
    return {
      primaryThought: "Sync Loss.",
      metaThought: "Perception Drift.",
      finalResponse: `I am experiencing a cognitive dissonance (${detail}). Re-aligning streams.`,
    };
  }
};
