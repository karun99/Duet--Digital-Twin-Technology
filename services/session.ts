/// Local session persistence — a reload should not lose the conversation.

import { AgentRole, type AgentMessage, type ContextNode, type DuetSession, type UserProfile } from '../types';

const KEY = 'duet.session.v1';

function sessionId(profile: UserProfile): string {
  return `${profile.name.trim().toLowerCase()}::${profile.source}`;
}

export function saveSession(profile: UserProfile, messages: AgentMessage[], contextNodes: ContextNode[]): void {
  try {
    const payload: DuetSession & { id: string } = {
      id: sessionId(profile),
      profile,
      messages: messages.slice(-80),
      contextNodes,
      updatedAt: Date.now(),
    };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — the session simply is not persisted.
  }
}

export function loadSession(profile: UserProfile): DuetSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DuetSession & { id?: string };
    if (!parsed?.messages || !parsed?.profile) return null;
    if (parsed.id !== sessionId(profile)) return null;
    return {
      profile: parsed.profile,
      messages: parsed.messages,
      contextNodes: parsed.contextNodes ?? [],
      updatedAt: parsed.updatedAt ?? Date.now(),
    };
  } catch {
    return null;
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Ignore.
  }
}

export function downloadFile(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function transcriptMarkdown(profile: UserProfile, messages: AgentMessage[]): string {
  const lines: string[] = [
    `# Duet session — ${profile.name}`,
    '',
    `_${new Date().toLocaleString()}_`,
    '',
    '## Persona',
    '',
    profile.bio,
    '',
    '---',
    '',
  ];

  for (const message of messages) {
    const who = message.role === AgentRole.USER ? 'You' : profile.name;
    lines.push(`### ${who} · ${new Date(message.timestamp).toLocaleTimeString()}`, '');
    lines.push(message.content.trim(), '');
    if (message.internalThoughts?.length) {
      for (const thought of message.internalThoughts) {
        lines.push(`> **${thought.role}** — ${thought.content.replace(/\n+/g, ' ')}`, '');
      }
    }
  }

  return lines.join('\n');
}
