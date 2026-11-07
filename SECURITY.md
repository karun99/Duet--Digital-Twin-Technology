# Security Policy

Duet is a **browser-only application**. There is no Duet backend, no account
system, and no server-side store of prompts, personas, personal information, or
API keys. This policy states what that architecture protects — and, just as
importantly, what it does not.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest `main` — deployed at [duet-digital-twin-technology.vercel.app](https://duet-digital-twin-technology.vercel.app/) and the [Hugging Face Space](https://saikarun-duet-digital-twin.static.hf.space) | :white_check_mark: |
| Older builds, forks, and self-hosted copies | :x: — best effort only |

Security fixes land on `main` and are redeployed. There are no long-term support
branches.

## Architecture and trust boundary

- Duet ships as static HTML, CSS, and JavaScript built with Vite. It has no
  first-party server and no database.
- Provider API keys are entered by the user, stored in the browser
  (`localStorage`), and sent only to the provider endpoint the user selected.
- Persona, conversation history, personal-information (PI) fields, consent state,
  and DUNCE/audit logs are stored in browser storage.
- Optional deployment keys (`GEMINI_API_KEY`, `OPENROUTER_API_KEY`,
  `NVIDIA_API_KEY`) are injected at build time. A deployment key is usable by
  anyone who can reach that deployment — never ship a privileged or
  high-quota key this way.
- The MAS operating protocol (`services/mas.ts`) is a **local policy layer**:
  prompt-level Six Hats plus deterministic local checks (KB-miss block, PI
  consent, governor heuristics, EMOJA rewrite). It is **not** a server-side
  firewall and must not be treated as one.

## Known limitations

These are documented deliberately rather than hidden:

| Area | Current state | Consequence |
| --- | --- | --- |
| API keys in `localStorage` | By design, for bring-your-own-key use | Any cross-site scripting on the origin could read them. Use a dedicated, low-quota key; rotate it; clear site data when finished. |
| Content-Security-Policy | Not set by the application | Weakens defence-in-depth against injection. Model output is rendered through `react-markdown`, not raw HTML, which limits but does not eliminate the risk. |
| MAS enforcement | Local and prompt-level | Not a hard guardrail against prompt injection or a hostile model provider. |
| Hosted deployment keys | Optional, build-time | Visible to anyone who can use that deployment. Prefer BYOK for public instances. |
| Personal information | Off by default; per-field consent; local only | There is no server-side PI store, so there is also no server-side deletion or recovery. Clearing browser data removes it. |

If you need hard multi-tenant isolation, server-side key custody, or enforced
policy, run Duet behind your own gateway rather than relying on the browser
layer.

## Reporting a vulnerability

Please use GitHub's private security advisory flow:

1. Open the **Security** tab of
   [karun99/Duet--Digital-Twin-Technology](https://github.com/karun99/Duet--Digital-Twin-Technology).
2. Choose **Report a vulnerability**.
3. Include the affected commit or deployment, impact, and reproduction steps or
   a proof of concept.

**Acknowledgement:** within 3 business days. Please do **not** open a public
issue for key exposure, cross-site scripting, or data-leak reports.

## Disclosure policy

- We aim to patch before public disclosure.
- Coordinated disclosure window: **90 days**, or sooner by mutual agreement.
- Credit is given in the advisory or release notes unless you ask to remain
  anonymous.
- Reports about the upstream model providers, the browser vendors, or
  third-party links are out of scope for this repository; report those to the
  relevant party.

## Dependency and supply-chain hygiene

- Dependencies are declared in `package.json` and locked in `package-lock.json`.
- CI runs `npm run typecheck` and `npm run build` on changes.
- GitHub Actions and npm dependencies are monitored by Dependabot; security
  alerts are triaged within 24 hours.
- Do not commit `.env` files or provider keys. Use `.env.example` as the
  template, and keep deployment secrets in the hosting provider's environment
  settings.

## Scope

**In scope:** the application source in this repository, the Vercel and Hugging
Face deployments, provider-key handling, PI consent and audit logic, MAS
governor behaviour, and dependency vulnerabilities.

**Out of scope:** the model providers themselves, third-party websites linked
from the UI, and forks that have been modified by their maintainers.
