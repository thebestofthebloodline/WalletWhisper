import React, { useState, useEffect } from 'react';
import {
  getSettings,
  setSettings,
  clearAllData,
  getWalletAddress,
  type ExtensionSettings,
} from '@/utils/storage';

const OptionsApp: React.FC = () => {
  const [settings, setLocalSettings] = useState<ExtensionSettings>({
    serverUrl: 'http://localhost:4000',
    notificationsEnabled: true,
    safetyMode: false,
  });
  const [wallet, setWallet] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    async function load() {
      const s = await getSettings();
      setLocalSettings(s);
      const w = await getWalletAddress();
      setWallet(w);
    }
    load();
  }, []);

  const updateSetting = async <K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K],
  ) => {
    const updated = { ...settings, [key]: value };
    setLocalSettings(updated);
    await setSettings({ [key]: value });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearData = async () => {
    if (!confirm('This will delete all local data including your messaging keys. You will need to reconnect your wallet. Continue?')) {
      return;
    }
    setClearing(true);
    await clearAllData();
    setWallet(null);
    setLocalSettings({
      serverUrl: 'http://localhost:4000',
      notificationsEnabled: true,
      safetyMode: false,
    });
    setClearing(false);
    alert('All local data cleared.');
  };

  return (
    <div
      style={{
        maxWidth: '560px',
        margin: '0 auto',
        padding: '40px 24px',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z"
            stroke="#6366f1"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#e2e8f0' }}>
            WalletWhisper Settings
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
            Configure your encrypted messaging preferences
          </p>
        </div>
      </div>

      {/* Connected wallet */}
      {wallet && (
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            borderRadius: '10px',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#22c55e',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>Connected Wallet</div>
            <div style={{ fontSize: '13px', fontFamily: 'monospace', color: '#e2e8f0' }}>
              {wallet}
            </div>
          </div>
        </div>
      )}

      {/* Server URL */}
      <Section title="Server">
        <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: '#94a3b8' }}>
          Server URL
        </label>
        <input
          type="text"
          value={settings.serverUrl}
          onChange={(e) => updateSetting('serverUrl', e.target.value)}
          style={{
            width: '100%',
            background: '#1a1d26',
            border: '1px solid #2a2d38',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#e2e8f0',
            fontSize: '13px',
            fontFamily: 'monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#6366f1';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = '#2a2d38';
          }}
        />
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
          The WalletWhisper relay server URL. Default: http://localhost:4000
        </div>
      </Section>

      {/* Notifications */}
      <Section title="Notifications">
        <ToggleRow
          label="Enable notifications"
          description="Show desktop notifications for new messages"
          checked={settings.notificationsEnabled}
          onChange={(v) => updateSetting('notificationsEnabled', v)}
        />
      </Section>

      {/* Safety */}
      <Section title="Safety">
        <ToggleRow
          label="Safety Mode"
          description="Only receive messages from wallets you've started a chat with first. Incoming requests from unknown wallets will be silently blocked."
          checked={settings.safetyMode}
          onChange={(v) => updateSetting('safetyMode', v)}
        />
      </Section>

      {/* Data */}
      <Section title="Data">
        <button
          onClick={handleClearData}
          disabled={clearing}
          style={{
            padding: '10px 20px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: '8px',
            color: '#ef4444',
            cursor: clearing ? 'default' : 'pointer',
            fontWeight: 600,
            fontSize: '13px',
            transition: 'background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            if (!clearing) e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
          }}
        >
          {clearing ? 'Clearing...' : 'Clear All Local Data'}
        </button>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '6px' }}>
          Deletes JWT token, messaging keys, settings, and all cached data.
          You will need to reconnect your wallet.
        </div>
      </Section>

      {/* Version & Disclaimer */}
      <div
        style={{
          marginTop: '32px',
          padding: '16px',
          background: '#1a1d26',
          borderRadius: '10px',
          border: '1px solid #2a2d38',
        }}
      >
        <div style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '8px' }}>
          WalletWhisper v0.1.0
        </div>
        <div style={{ fontSize: '11px', color: '#64748b', lineHeight: '1.6' }}>
          WalletWhisper is not affiliated with Terminal Trade, Padre, Axiom, or any trading platform.
          Messages are end-to-end encrypted using NaCl Box (Curve25519 + XSalsa20-Poly1305).
          The server never has access to plaintext messages.
        </div>
      </div>

      {/* Saved toast */}
      {saved && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            padding: '10px 20px',
            background: '#22c55e',
            color: 'white',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          Settings saved
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

// ─── Reusable components ───

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '24px' }}>
      <h2
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#e2e8f0',
          marginBottom: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </h2>
      <div
        style={{
          padding: '16px',
          background: '#1a1d26',
          borderRadius: '10px',
          border: '1px solid #2a2d38',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: '#e2e8f0' }}>{label}</div>
        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', lineHeight: '1.4' }}>
          {description}
        </div>
      </div>
      <button
        onClick={() => onChange(!checked)}
        role="switch"
        aria-checked={checked}
        style={{
          flexShrink: 0,
          width: '44px',
          height: '24px',
          borderRadius: '12px',
          background: checked ? '#6366f1' : '#2a2d38',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          transition: 'background 0.2s ease',
          padding: 0,
        }}
      >
        <span
          style={{
            display: 'block',
            width: '18px',
            height: '18px',
            borderRadius: '50%',
            background: 'white',
            position: 'absolute',
            top: '3px',
            left: checked ? '23px' : '3px',
            transition: 'left 0.2s ease',
          }}
        />
      </button>
    </div>
  );
}

export default OptionsApp;
