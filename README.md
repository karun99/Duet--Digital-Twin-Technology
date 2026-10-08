<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Duet — Agentic AI & Parallel Consciousness

A digital-twin application: it builds a high-fidelity simulation of a person's
ideology, worldview, and perception, then talks to you as that parallel
consciousness (`[[PRIMARY]] → [[META]] → [[RESPONSE]]`, with optional
`[[SKETCH]]` visualizations).

## Sign in: OpenRouter, free models only

The app needs **no environment variable** to work:

1. Create a free API key at [openrouter.ai/keys](https://openrouter.ai/keys).
2. Paste it on the **OpenRouter Link** screen. The key is stored only in your
   browser (localStorage) and sent only to `openrouter.ai`.
3. Chat. Every reply is routed through OpenRouter's **free model router**
   (`openrouter/free`), which picks a free model per request.

If a free model is rate-limited or unavailable, the router automatically
rotates to the next free model — there is no paid fallback by design. Use
**Change_Key** in the header to sign out or switch keys.

### Optional host key

`GEMINI_API_KEY` (see [.env.example](.env.example)) is optional. When the
deployment ships one, it keeps search-grounded bio lookup, AI avatars/sketches,
and Neural Voice Link available at no cost to the user. Without it:

- bio search and link analysis run through the free OpenRouter text path
- links are read via a public reader, then summarized
- avatars and sketches are generated procedurally in-browser (blueprint style)
- Neural Voice Link is disabled with a clear message

## Jātaka Guardrails

The clone's system prompt carries the twelve Jātaka Guardrails of the Jijñāsā
system in **Presence** mode: held silently, never invoked. **Invocation**
happens only after the person says "I'm stuck" twice in the same thread —
exactly one precedent, its anchor line once, nothing else.

- Registry: [.jijnasa/guardrails.md](.jijnasa/guardrails.md)
- Invocation log: [.jijnasa/guardrail-log.md](.jijnasa/guardrail-log.md)
- Prompt copy: `constants.ts` → `JATAKA_GUARDRAIL_BLOCK`

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
```

## Verify

```bash
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build → dist/
```
