import React, { useEffect, useState } from 'react';
import { Modal } from '../../components/Modal';
import type { AccountInfo } from '@shared/types';

const TEMPLATE = `## Voice & Tone
(e.g. casual, high-energy, dry humor...)

## Audience
(who watches this account, what they care about)

## Style Rules
-
-

## Example Hooks
-
`;

export function AccountManagerModal({
  accounts,
  onClose,
  onChanged,
}: {
  accounts: AccountInfo[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(accounts[0]?.id ?? null);
  const [name, setName] = useState(accounts[0]?.name ?? '');
  const [content, setContent] = useState(accounts[0]?.content ?? TEMPLATE);
  const [isNew, setIsNew] = useState(accounts.length === 0);

  useEffect(() => {
    if (selectedId) {
      const acc = accounts.find((a) => a.id === selectedId);
      if (acc) {
        setName(acc.name);
        setContent(acc.content);
        setIsNew(false);
      }
    }
  }, [selectedId]);

  function startNew() {
    setSelectedId(null);
    setName('');
    setContent(TEMPLATE);
    setIsNew(true);
  }

  async function save() {
    if (!name.trim()) return;
    await window.api.accounts.save({ id: isNew ? '' : selectedId ?? '', name: name.trim(), content });
    onChanged();
    onClose();
  }

  async function remove() {
    if (!selectedId) return;
    if (!confirm(`Delete account "${name}"?`)) return;
    await window.api.accounts.delete(selectedId);
    onChanged();
    onClose();
  }

  return (
    <Modal title="Manage Accounts" onClose={onClose} width={640}>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ width: 160, flexShrink: 0 }}>
          <button className="btn btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={startNew}>
            + New
          </button>
          {accounts.map((a) => (
            <div
              key={a.id}
              className={`saved-list-item ${a.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(a.id)}
            >
              {a.name}
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="field-label">Account Name</label>
          <input className="text-input" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 10 }} />
          <label className="field-label">Style Guide (Markdown)</label>
          <textarea
            className="text-input"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={16}
            style={{ fontFamily: 'monospace', fontSize: 12, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn btn-primary" onClick={save} disabled={!name.trim()}>
              Save
            </button>
            {!isNew && (
              <button className="btn btn-danger" onClick={remove}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
