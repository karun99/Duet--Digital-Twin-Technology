import React, { useCallback, useEffect, useState } from 'react';
import { Onboarding } from './components/Onboarding';
import { Simulation } from './components/Simulation';
import { ProviderGate } from './components/ProviderGate';
import { MasPanel } from './components/MasPanel';
import { Modal, ToastStack } from './components/ui';
import { IconKey, IconSettings } from './components/icons';
import { useLlmConfig, isConnected, PROVIDERS } from './services/llm';
import { ACCENT_CLASSES } from './services/llm/providers';
import { clearSession } from './services/session';
import { loadMasState, saveMasState } from './services/mas';
import type { MasState, Toast, ToastKind, UserProfile } from './types';

const PROFILE_KEY = 'duet.profile.v1';

function loadProfile(): UserProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserProfile;
    return parsed?.name && parsed?.bio ? parsed : null;
  } catch {
    return null;
  }
}

function saveProfile(profile: UserProfile | null): void {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

function App() {
  const config = useLlmConfig();
  const meta = PROVIDERS[config.provider];
  const accent = ACCENT_CLASSES[meta.accent];

  const [profile, setProfile] = useState<UserProfile | null>(() => loadProfile());
  const [connected, setConnected] = useState<boolean>(() => isConnected());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [protocolOpen, setProtocolOpen] = useState(false);
  const [mas, setMas] = useState<MasState>(() => loadMasState());
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((kind: ToastKind, title: string, detail?: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((previous) => [...previous.slice(-2), { id, kind, title, detail }]);
    setTimeout(() => {
      setToasts((previous) => previous.filter((toast) => toast.id !== id));
    }, kind === 'error' ? 9000 : 5000);
  }, []);

  // The config store is the source of truth for "can we talk to a model".
  useEffect(() => {
    setConnected(isConnected());
  }, [config]);

  const updateMas = useCallback((next: MasState) => {
    saveMasState(next);
    setMas(next);
  }, []);

  const startSession = (next: UserProfile) => {
    saveProfile(next);
    setProfile(next);
  };

  const endSession = () => {
    clearSession();
    saveProfile(null);
    setProfile(null);
  };

  if (!connected) {
    return (
      <>
        <ProviderGate
          mode="connect"
          onReady={() => {
            setConnected(true);
            pushToast('success', 'Model linked', `${meta.name} · ${config.model}`);
          }}
        />
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((previous) => previous.filter((t) => t.id !== id))} />
      </>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#030303] text-neutral-200">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute left-[-12%] top-[-18%] h-[46vw] w-[46vw] rounded-full bg-cyan-900/[0.09] blur-[150px]" />
        <div className="absolute bottom-[-20%] right-[-12%] h-[52vw] w-[52vw] rounded-full bg-violet-900/[0.09] blur-[170px]" />
        <div className="noise-overlay absolute inset-0 opacity-[0.035] mix-blend-overlay" />
        <div className="grid-overlay absolute inset-0 opacity-[0.025]" />
      </div>

      {!profile ? (
        <>
          <header className="relative z-20 flex h-16 shrink-0 items-center justify-between border-b border-white/[0.06] bg-[#050505]/70 px-3 backdrop-blur-xl sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-violet-600 shadow-lg shadow-cyan-500/20">
                <span className="font-display text-sm font-bold text-black">D</span>
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-[14px] font-semibold leading-none tracking-tight text-white">
                  Duet
                </h1>
                <p className="mt-1 truncate font-mono text-[8px] uppercase tracking-[0.24em] text-neutral-600">
                  parallel consciousness
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
                title="Model settings"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} />
                <span className="hidden max-w-[150px] truncate sm:inline">{config.model.split('/').pop()}</span>
                <span className="sm:hidden">{meta.short}</span>
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                aria-label="Settings"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-neutral-400 transition-colors hover:border-white/20 hover:text-white"
              >
                <IconSettings size={16} />
              </button>
            </div>
          </header>

          <main className="relative z-10 flex-1 overflow-y-auto px-3 pb-8 pt-2 sm:px-6">
            <Onboarding
              onComplete={startSession}
              onOpenSettings={() => setSettingsOpen(true)}
              onOpenProtocol={() => setProtocolOpen(true)}
            />
          </main>
        </>
      ) : (
        <div className="relative z-10 h-full min-h-0">
          <Simulation
            userProfile={profile}
            onBack={endSession}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenProtocol={() => setProtocolOpen(true)}
            mas={mas}
            onMasChange={updateMas}
            onToast={pushToast}
          />
        </div>
      )}

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} labelledBy="settings-title">
        <div className="border-b border-white/[0.06] px-5 py-4 sm:px-7">
          <h2 id="settings-title" className="font-display text-lg font-semibold tracking-tight text-white">
            Connection
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-neutral-500">
            <IconKey size={12} />
            Keys are stored in this browser and sent only to the provider you choose.
          </p>
        </div>
        <ProviderGate mode="settings" onClose={() => setSettingsOpen(false)} />
      </Modal>

      <Modal open={protocolOpen} onClose={() => setProtocolOpen(false)} labelledBy="protocol-title">
        <MasPanel state={mas} onChange={updateMas} />
      </Modal>

      <ToastStack
        toasts={toasts}
        onDismiss={(id) => setToasts((previous) => previous.filter((toast) => toast.id !== id))}
      />
    </div>
  );
}

export default App;
