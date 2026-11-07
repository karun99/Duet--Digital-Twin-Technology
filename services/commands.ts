/// Slash commands for the existing duet. Commands are typed in the composer:
/// they are visible in the transcript, but they also carry a hidden protocol
/// payload into the model's system instruction.

import { PERSONAFORGE_COMMAND } from './personaforge';

export interface DuetCommand {
  name: string;
  usage: string;
  description: string;
}

export const COMMANDS: DuetCommand[] = [PERSONAFORGE_COMMAND];

export interface ParsedCommand {
  name: string;
  arg: string;
  raw: string;
}

/** Returns null for normal chat, or the matched command with its argument. */
export function parseCommand(text: string): ParsedCommand | null {
  const match = text.trim().match(/^\/([a-z][\w-]*)(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const name = match[1].toLowerCase();
  if (!COMMANDS.some((command) => command.name === name)) return null;
  return { name, arg: (match[2] ?? '').trim(), raw: text.trim() };
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Commands shown while the composer starts with "/". */
export function suggestCommands(input: string): DuetCommand[] {
  const text = input.trimStart();
  if (!text.startsWith('/') || text.includes(' ')) return [];
  const prefix = text.toLowerCase();
  return COMMANDS.filter((command) => `/${command.name}`.startsWith(prefix));
}
