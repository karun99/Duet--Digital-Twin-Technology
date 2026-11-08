# Duet — Digital Twin Technology

Duet builds a high-fidelity simulation of a person's ideology, worldview and
perception, then talks to you as that parallel consciousness.

Every reply is structured the same way:

```
[[PRIMARY]]  the immediate, executive reaction
[[META]]     why this persona reads the world that way
[[RESPONSE]] the spoken answer, in character
```

You watch all three streams form live, and can re-open the reasoning of any past
turn. Optional `[[SKETCH]]` blocks become diagrams when an image model is
available.

A local **MAS operating protocol** — Six Hats, EMOJA, PERSONAFORGE, DUNCE,
KUNDALINI and JATAKA — checks tone, risk and evidence on every reply. Open
**Protocol** to set PI consent, choose a retrieval mode, inspect the guard
chips, or read the DUNCE/audit logs.

### PERSONAFORGE command

Type `/forge <url>` in a duet to run the **PERSONAFORGE** protocol on one page.
It fetches the source, extracts the real people and roles the page states,
produces a cast table and persona cards, then interviews you one persona at a
time. Every persona attribute must be traceable to the page; unknowns are
reported as unknown. The command runs beside EMOJA and JATAKA, so tone and
safety checks still apply. Type `/forge exit` to return to the persona's normal
voice.

Fetching is best-effort and tries three routes in order: Jina Reader, the
AllOrigins CORS proxy, then the page directly. If all three fail the command
still runs, but it is explicitly told not to fill the gap from memory.

When a cast is detected, a picker appears above the composer with the page's
people and roles. Pick one, or say **"I don't know."** A question that goes
unanswered twice becomes a `FINDING` in the scorecard, and the interviewer stops
re-asking it and moves on.

> Duet started as a shared first project. The memory of building it is part of
> what it is.

## Paper

The system is described in *Duet: Agentic AI and the Construction of Parallel
Consciousness* (Sai Karun Nandipati, 2026).

- DOI: [10.5281/zenodo.23831022](https://doi.org/10.5281/zenodo.23831022)
- Mirror: [huggingface.co/datasets/saikarun/duet-paper](https://huggingface.co/datasets/saikarun/duet-paper)

```bibtex
@article{nandipati2026duet,
  title     = {Duet: Agentic AI and the Construction of Parallel Consciousness},
  author    = {Nandipati, Sai Karun},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.23831022},
  url       = {https://doi.org/10.5281/zenodo.23831022}
}
```

---

## Bring any model

There is no server and no account. You paste one key, it stays in your browser,
and it is sent only to the provider you picked.

| Provider | Endpoint | Default model | Free option |
| --- | --- | --- | --- |
| **OpenRouter** | `openrouter.ai/api/v1` | `openrouter/free` | Yes — free router rotates models |
| **Google Gemini** | `generativelanguage.googleapis.com/v1beta` | `gemini-2.5-flash` | Yes — AI Studio free tier |
| **NVIDIA NIM** | `integrate.api.nvidia.com/v1` | `meta/llama-3.3-70b-instruct` | Free developer credits |
| **Custom** | any OpenAI-compatible URL | you choose | whatever your endpoint allows |

"Custom" covers Groq, Together, DeepSeek, Mistral, Ollama, LM Studio, vLLM,
OpenAI itself — anything that speaks `POST /chat/completions`.

### What each provider unlocks

| Feature | OpenRouter | Gemini | NVIDIA | Custom |
| --- | --- | --- | --- | --- |
| Streaming chat | ✅ | ✅ | ✅ | ✅ |
| Model browser with search | ✅ | ✅ | ✅ | ✅ when `/models` exists |
| Image attachments (vision) | ✅ | ✅ | ✅ | model dependent |
| Search-grounded persona lookup | – | ✅ | – | – |
| AI avatar / sketch images | – | ✅ | – | – |
| Live voice link | – | ✅ (AI Studio key) | – | – |

Without an image model, avatars and sketches are generated procedurally in the
browser, so nothing is ever a dead end.

### Optional host keys

A deployment can offer a provider to visitors at its own cost. Set any of
`GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `NVIDIA_API_KEY` (see
[.env.example](.env.example)); a **Use deployment key** button then appears on
the connect screen. Nothing is required for the app to run.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
```

Verify before shipping:

```bash
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + vite build → dist/
```

Deploy to Vercel (or any static host) with `npm run build` and `dist/` as the
output directory — `vercel.json` is already configured.

### Hugging Face Space

Live: **<https://saikarun-duet-digital-twin.static.hf.space>**
(Space repo: <https://huggingface.co/spaces/saikarun/duet-digital-twin>)

Static Spaces serve files from the repo root, so publish the contents of
`dist/` — not the folder itself — alongside a `README.md` whose front matter
declares `sdk: static`:

```bash
npm run build
cp -r dist/* /tmp/duet-space/          # index.html must sit at the root
hf upload saikarun/duet-digital-twin /tmp/duet-space . --repo-type space
```

The Space is rebuilt on every push to its repo; the app itself is unchanged.

---

## How it works

```
index.tsx → App.tsx
             ├── ProviderGate   connect / settings (any provider)
             ├── Onboarding     persona construction
             └── Simulation     the duet itself
```

```
services/
  llm/
    providers.ts   provider registry: endpoints, key hints, accents
    config.ts      localStorage config, host keys, reactive store
    client.ts      transport: SSE streaming, vision, model listing, validation
  duet.ts          persona lookup, link ingestion, avatars, clone chat
  mas.ts           operating protocol, guards, KB/PI addresses, DUNCE log
  personaforge.ts  /forge protocol, persona cards, grounding/turn checks
  commands.ts      slash-command parsing and command palette
  session.ts       local session persistence + markdown export
components/
  MasPanel.tsx     protocol controls, PI consent, DUNCE and audit views
```

Design decisions worth knowing:

- **One transport interface.** OpenAI-compatible providers share one path;
  Gemini has its own adapter. Adding a provider is a few lines in
  `providers.ts`, not a new code path.
- **Streaming everywhere.** `chat()` streams through `onDelta`; the UI parses
  the `[[PRIMARY]] → [[META]] → [[RESPONSE]]` tags incrementally so you see the
  duet think instead of watching a spinner.
- **Real resilience.** OpenRouter retries across free models on 402/429/404.
  Every provider surfaces typed errors (`LlmError`) with a retry path instead of
  failing silently.
- **Local by default.** Keys, persona and conversation live in `localStorage`.
  The only outbound calls are to your provider, plus a page reader when you
  paste a link (`r.jina.ai`, falling back to `api.allorigins.win`, then the page
  itself).
- **Compiled CSS.** Tailwind is built at compile time — no CDN, no runtime
  style generation.

---

## Operating protocol (MAS)

Open **Protocol** from the header, the sidebar, or the onboarding screen. The
layer sits above the persona prompt and wraps every reply in a local governor:

- **KUNDALINI (Blue Hat)** owns the agenda, mode, stage and PI consent.
- **EMOJA (Red Hat)** owns tone. It can veto and rewrite shouting or hostility.
- **DUNCE** keeps the error/correction log and retrieves past failures before
  the next turn.
- **JATAKA** checks G1 intention, G2 non-harm, G3 truthful speech, G4
  non-attachment, G5 right relationship and G6 consequence memory.
- **SIX HATS** resolve internally; `[[META]]` carries the synthesis rather than
  printing every hat.

Every reply gets a compact governor strip under it: mode, grounded state, risk,
verdict, EMOJA status and the six guard chips. The raw `[[GOVERNOR]]` block is
parsed out before display.

### Modes

| Mode | Behaviour |
| --- | --- |
| `SINGLE` | Normal answer, grounded in injected KB nodes when useful. |
| `KB-PRIMARY` | KB is the only permitted source. No entry means `[KB_MISS]` and a stop before the model is called. |
| `REFRESH` | Propose a correction with evidence and wait for `ACCEPT`; never silently rewrite. |
| `SITEMAP` / `INDEX` | Declared only. This client has no live crawler, so it never claims a crawl. |

### What is actually enforced

| Capability | Status |
| --- | --- |
| PI consent gate, per-field approval, audit log | **Enforced** in the browser |
| `kb://` addresses for injected nodes | **Enforced** (FNV-1a hash, `v=1`) |
| `KB-PRIMARY` stops on no KB | **Enforced** before the request |
| JATAKA G1–G6 heuristics | **Enforced** on the returned text |
| EMOJA tone veto and rewrite | **Enforced** for shouting/hostility patterns |
| DUNCE log + stage escalation | **Enforced** in `localStorage` |
| G2 human approval gate | **Escalates** — it never executes an action |
| PERSONAFORGE command injection | **Enforced** — the `/forge` prompt is in the system instruction |
| PERSONAFORGE one-question check | **Enforced** — question marks are counted locally |
| PERSONAFORGE meta-leak / unsourced-credential check | **Heuristic** — pattern matches, not a firewall |
| SITEMAP / INDEX crawling | **Declared** — no crawler exists |
| `REFRESH` write-back | **Policy** — no persistent KB store to write to |
| Six Hats deliberation | **Prompt-level** — not a hard firewall |

`kb://`, `pi://` and `jataka://` are address conventions, not a database. There
is no server-side PI, and the guard checks are heuristics over the reply text.

---

## Keyboard

| Key | Action |
| --- | --- |
| `Enter` | Send |
| `Shift + Enter` | New line |
| `Esc` | Close the open modal |

---

## Security

Duet is browser-only: there is no first-party server, and keys, personas and PI
stay in your browser. The policy also states the limits honestly — keys live in
`localStorage`, the app does not set a Content-Security-Policy, and the MAS
checks are local rather than server-enforced.

See [**SECURITY.md**](SECURITY.md) for the threat model, known limitations, and
private reporting process.

---

## License

Personal project by [Sai Karun Nandipati](https://karun99.github.io).
