import { useState } from 'react';

interface Props {
  title?: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}

export default function PasswordPrompt({ title, onSubmit, onCancel, error, busy }: Props) {
  const [pw, setPw] = useState('');
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 14, fontSize: 18, color: '#8b1a1a' }}>
          {title ?? 'كلمة المرور مطلوبة'}
        </h3>
        <p style={{ marginBottom: 12, color: '#666', fontSize: 14 }}>
          أدخل كلمة المرور للمتابعة
        </p>
        <input
          autoFocus
          type="password"
          className="field-input"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && pw && !busy) onSubmit(pw);
          }}
          placeholder="••••••••"
        />
        {error && <div style={{ color: '#8b1a1a', fontSize: 13, marginTop: 8 }}>{error}</div>}
        <div className="drawer-footer" style={{ paddingInline: 0, paddingBottom: 0, marginTop: 18 }}>
          <button
            className="btn-primary btn"
            disabled={!pw || busy}
            onClick={() => onSubmit(pw)}
          >
            {busy ? 'جارٍ المعالجة...' : 'متابعة'}
          </button>
          <button className="btn" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
