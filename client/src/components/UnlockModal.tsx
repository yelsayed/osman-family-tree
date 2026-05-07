import { useState } from 'react';
import { Lock } from 'lucide-react';

interface Props {
  onSubmit: (password: string) => void | Promise<void>;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}

export default function UnlockModal({ onSubmit, onCancel, error, busy }: Props) {
  const [pw, setPw] = useState('');
  const submit = () => {
    if (!pw || busy) return;
    onSubmit(pw);
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Lock size={20} color="#8b1a1a" />
          <h3 style={{ fontSize: 18, color: '#8b1a1a', margin: 0 }}>فتح وضع التعديل</h3>
        </div>
        <p style={{ marginBottom: 14, fontSize: 14, color: '#666' }}>
          أدخل كلمة المرور لتمكين التعديل والإضافة والحذف خلال هذه الجلسة.
        </p>
        <label className="field-label">كلمة المرور</label>
        <input
          autoFocus
          className="field-input"
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder="••••••••"
        />
        {error && <div style={{ color: '#8b1a1a', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="drawer-footer" style={{ paddingInline: 0, paddingBottom: 0, marginTop: 18 }}>
          <button
            className="btn btn-primary"
            disabled={!pw || busy}
            onClick={submit}
          >
            {busy ? 'جارٍ التحقق...' : 'فتح القفل'}
          </button>
          <button className="btn" onClick={onCancel} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
