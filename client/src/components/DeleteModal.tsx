import type { FamilyNode } from '../types';

interface Props {
  node: FamilyNode | null;
  descCount: number;
  onConfirm: () => void;
  onCancel: () => void;
  error?: string;
  busy?: boolean;
}

export default function DeleteModal({ node, descCount, onConfirm, onCancel, error, busy }: Props) {
  if (!node) return null;
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 12, fontSize: 18, color: '#8b1a1a' }}>تأكيد الحذف</h3>
        <p style={{ marginBottom: 14, fontSize: 15, color: '#1a1a1a' }}>
          سيتم حذف <strong>{node.name}</strong>
          {descCount > 0 && (
            <>
              {' '}مع <strong>{descCount}</strong> من الذرية.
            </>
          )}
        </p>
        <p style={{ marginBottom: 14, fontSize: 13, color: '#888' }}>هذا الإجراء لا يمكن التراجع عنه.</p>
        {error && <div style={{ color: '#8b1a1a', fontSize: 13, marginBottom: 10 }}>{error}</div>}
        <div className="drawer-footer" style={{ paddingInline: 0, paddingBottom: 0, marginTop: 8 }}>
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? 'جارٍ الحذف...' : 'حذف نهائي'}
          </button>
          <button className="btn" onClick={onCancel} disabled={busy}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}
