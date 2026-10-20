import React, { useState } from 'react';
import { validateApiKey, setApiKey } from '../services/openrouter';

interface OpenRouterGateProps {
  onReady: () => void;
}

export const OpenRouterGate: React.FC<OpenRouterGateProps> = ({ onReady }) => {
  const [key, setKey] = useState('');
  const [reveal, setReveal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) {
      setError('Paste your OpenRouter key to establish the link.');
      return;
    }
    if (!trimmed.startsWith('sk-or-')) {
      setError('OpenRouter keys start with "sk-or-". Check that you copied the whole key.');
      return;
    }

    setError(null);
    setIsVerifying(true);
    try {
      await validateApiKey(trimmed);
      setApiKey(trimmed);
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that key.');
    } finally {
      setIsVerifying(false);
    }
  };

  const continueWithGemini = () => {
    onReady();
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[#050505] p-4 sm:p-6 overflow-y-auto safe-top safe-bottom">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-15%] left-[-10%] w-[50vw] h-[50vw] bg-cyan-900/10 rounded-full blur-[160px] animate-pulse-slow"></div>
        <div className="absolute bottom-[-15%] right-[-10%] w-[60vw] h-[60vw] bg-purple-900/10 rounded-full blur-[160px]"></div>
      </div>

      <div className="relative w-full max-w-xl glass-panel rounded-[2.5rem] sm:rounded-[3rem] border-t border-cyan-900 p-6 sm:p-10 md:p-16 shadow-[0_0_150px_rgba(34,211,238,0.08)] animate-fade-in my-4">
        <div className="mb-12 text-center">
          <div className="inline-block p-5 rounded-2xl bg-cyan-950/30 mb-8 border border-cyan-800 shadow-[0_0_30px_rgba(34,211,238,0.15)]">
            <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.029 5.912l-2.625 1.458a1 1 0 01-.954-.108l-.6-.48V15a1 1 0 01-1-1h-4a1 1 0 01-1-1v-.875l-.6.48a1 1 0 01-.954.108L5.03 12.912A6 6 0 0112 7h0a6 6 0 016 6z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-white to-purple-500 mb-5 sm:mb-6 tracking-tighter uppercase leading-tight">
            OpenRouter Link
          </h2>
          <p className="text-neutral-400 max-w-md mx-auto text-sm leading-relaxed font-light opacity-80">
            Duet runs on OpenRouter's free models. Paste your key once — it stays in this browser
            and travels only to openrouter.ai. Every reply is routed through the free model router.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div>
            <label className="block text-[10px] uppercase tracking-[0.4em] text-neutral-600 mb-4 font-mono font-bold ml-2">
              Access_Key
            </label>
            <div className="flex gap-4 bg-black/40 border border-neutral-800 rounded-3xl px-7 py-4 focus-within:border-cyan-500 transition-all shadow-inner">
              <input
                type={reveal ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="sk-or-..."
                autoComplete="off"
                spellCheck={false}
                className="flex-1 bg-transparent text-white focus:outline-none text-base font-mono tracking-wide min-w-0 placeholder-neutral-800"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                className="text-[10px] font-mono uppercase tracking-widest text-cyan-400 hover:text-white transition-all shrink-0"
              >
                {reveal ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-5 bg-red-900/10 border border-red-900/40 rounded-3xl text-red-500 text-[11px] font-mono text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isVerifying}
            className="w-full py-5 sm:py-6 bg-gradient-to-br from-cyan-600 to-purple-700 hover:from-cyan-500 hover:to-purple-600 disabled:opacity-30 text-white rounded-[2rem] sm:rounded-[2.5rem] font-bold text-xs tracking-[0.3em] sm:tracking-[0.4em] uppercase transition-all shadow-[0_0_50px_rgba(34,211,238,0.2)] active:scale-[0.98] flex items-center justify-center gap-4"
          >
            {isVerifying ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Verifying_Key
              </>
            ) : (
              <>
                Establish Link
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </form>

        {process.env.API_KEY && (
          <button
            type="button"
            onClick={continueWithGemini}
            className="w-full mt-5 py-4 text-[10px] font-mono uppercase tracking-[0.3em] text-neutral-500 hover:text-cyan-400 border border-white/10 hover:border-cyan-500/40 rounded-3xl transition-all"
          >
            Continue with host Gemini key
          </button>
        )}

        <p className="mt-8 text-center text-[11px] text-neutral-600 leading-relaxed">
          No key yet? Create one free at{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="text-cyan-400 hover:text-white transition-all underline underline-offset-4"
          >
            openrouter.ai/keys
          </a>
          . No card required. Free models are rate-limited — the router moves you to another free
          model when one is busy.
        </p>
      </div>
    </div>
  );
};
