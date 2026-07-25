import React, { useEffect, useState } from 'react';
import type { AccountInfo, Script } from '@shared/types';
import { AccountManagerModal } from './AccountManagerModal';

export function AccountStylePanel({
  script,
  onRewritten,
}: {
  script: Script;
  onRewritten: (newScript: Script) => void;
}) {
  const [accounts, setAccounts] = useState<AccountInfo[]>([]);
  const [accountId, setAccountId] = useState<string>('');
  const [managerOpen, setManagerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const list = await window.api.accounts.list();
    setAccounts(list);
    if (!accountId && list.length > 0) setAccountId(list[0].id);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function rewrite() {
    if (!accountId) return;
    setBusy(true);
    setError(null);
    try {
      const newScript = await window.api.gemini.rewrite({ script, accountId });
      onRewritten(newScript);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel" style={{ padding: 14 }}>
      <p className="panel-title">Rewrite with Account Style</p>
      {accounts.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--muted)' }}>No accounts yet.</p>
      ) : (
        <select className="text-input" value={accountId} onChange={(e) => setAccountId(e.target.value)} style={{ marginBottom: 8 }}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" style={{ flex: 1 }} onClick={() => setManagerOpen(true)}>
          Manage Accounts
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1 }}
          onClick={rewrite}
          disabled={busy || !accountId || script.rows.length === 0}
        >
          {busy ? 'Rewriting…' : 'Rewrite'}
        </button>
      </div>
      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
        Creates a new script — your current one is left untouched.
      </p>
      {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
      {managerOpen && (
        <AccountManagerModal accounts={accounts} onClose={() => setManagerOpen(false)} onChanged={refresh} />
      )}
    </div>
  );
}
