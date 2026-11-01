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

> Duet started as a shared first project. The memory of building it is part of
> what it is.

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
  session.ts       local session persistence + markdown export
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
  The only outbound calls are to your provider (and `r.jina.ai` if you paste a
  link to read).
- **Compiled CSS.** Tailwind is built at compile time — no CDN, no runtime
  style generation.

---

## Keyboard

| Key | Action |
| --- | --- |
| `Enter` | Send |
| `Shift + Enter` | New line |
| `Esc` | Close the open modal |

---

## License

Personal project by [Sai Karun Nandipati](https://karun99.github.io).
