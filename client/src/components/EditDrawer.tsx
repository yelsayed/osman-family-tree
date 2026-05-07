import type { NodeFormState } from '../types';

interface Props {
  mode: 'edit' | 'add';
  form: NodeFormState;
  setForm: (next: NodeFormState) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  error?: string;
  busy?: boolean;
}

export default function EditDrawer({ mode, form, setForm, onSave, onClose, error, busy }: Props) {
  const title = mode === 'edit' ? 'تعديل البيانات' : 'إضافة ابن جديد';

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-right" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <span>{title}</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 20,
              color: '#7a5030',
              lineHeight: 1,
            }}
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>
        <div className="drawer-body">
          <div>
            <label className="field-label">الاسم</label>
            <input
              className="field-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="اسم الشخص"
            />
          </div>
          <div>
            <label className="field-label">الجنس</label>
            <select
              className="field-input"
              value={form.sex}
              onChange={(e) => setForm({ ...form, sex: e.target.value as 'male' | 'female' })}
            >
              <option value="male">♂ ذكر</option>
              <option value="female">♀ أنثى</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="field-label">تاريخ الميلاد</label>
              <input
                className="field-input"
                type="date"
                value={form.born ?? ''}
                max="2100-12-31"
                min="1700-01-01"
                onChange={(e) => setForm({ ...form, born: e.target.value })}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label className="field-label">تاريخ الوفاة</label>
              <input
                className="field-input"
                type="date"
                value={form.died ?? ''}
                max="2100-12-31"
                min="1700-01-01"
                onChange={(e) => setForm({ ...form, died: e.target.value })}
              />
              <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                اتركه فارغاً إن كان حياً
              </div>
            </div>
          </div>
          <div>
            <label className="field-label">السيرة الذاتية</label>
            <textarea
              className="field-textarea"
              rows={4}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="نبذة..."
            />
          </div>
          <div>
            <label className="field-label">البريد الإلكتروني</label>
            <input
              className="field-input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="example@mail.com"
            />
          </div>

          {error && (
            <div style={{ color: '#8b1a1a', fontSize: 13, marginTop: 4 }}>{error}</div>
          )}
        </div>
        <div className="drawer-footer">
          <button
            className="btn btn-primary"
            disabled={!form.name?.trim() || busy}
            onClick={() => onSave()}
          >
            {busy ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button className="btn" onClick={onClose} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </>
  );
}
