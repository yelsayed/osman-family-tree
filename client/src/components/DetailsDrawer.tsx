import { useRef, useState } from 'react';
import { Camera, Pencil, Trash2 } from 'lucide-react';
import type { FamilyNode, NodeFormState } from '../types';
import { ageYears, formatRange, isDeceased as isDeceasedFn } from '../dateUtils';
import Avatar from './Avatar';
import Lightbox from './Lightbox';

export type DrawerMode = 'view' | 'edit' | 'add';

interface Props {
  mode: DrawerMode;
  /** The full node when viewing or editing — null for add. */
  node: FamilyNode | null;
  /** True when the admin password has been entered for this session. */
  unlocked: boolean;
  form: NodeFormState;
  setForm: (next: NodeFormState) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  /** view → edit (only callable when unlocked + mode === 'view'). */
  onEnterEdit?: () => void;
  /** edit → view ("Cancel" when we got here via the View → Edit path). */
  onCancelEdit?: () => void;
  onUploadPhoto: (file: File) => Promise<FamilyNode>;
  onDeletePhoto: () => Promise<FamilyNode>;
  error?: string;
  busy?: boolean;
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const ACCEPT_HINT = 'image/jpeg,image/png,image/webp';
const MAX_BYTES = 5 * 1024 * 1024;

function getExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i === -1 ? '' : name.slice(i + 1).toLowerCase();
}

/**
 * Fail-closed type check. Browsers don't always populate `file.type`, so we
 * also look at the extension as a fallback. Mismatched MIME-vs-extension is
 * rejected outright.
 */
function validateFileType(file: File): string | null {
  const ext = getExt(file.name);
  const hasType = !!file.type;
  const typeOk = hasType && ALLOWED_TYPES.has(file.type);
  const extOk = ALLOWED_EXTS.has(ext);

  if (!typeOk && !extOk) return 'الصيغ المدعومة: JPG, PNG, WebP';
  if (hasType && extOk) {
    const conflicting =
      (file.type === 'image/jpeg' && !(ext === 'jpg' || ext === 'jpeg')) ||
      (file.type === 'image/png' && ext !== 'png') ||
      (file.type === 'image/webp' && ext !== 'webp');
    if (conflicting) return 'نوع الملف لا يطابق امتداده';
  }
  return null;
}

export default function DetailsDrawer({
  mode,
  node,
  unlocked,
  form,
  setForm,
  onSave,
  onClose,
  onEnterEdit,
  onCancelEdit,
  onUploadPhoto,
  onDeletePhoto,
  error,
  busy,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const title =
    mode === 'view' ? 'تفاصيل' : mode === 'edit' ? 'تعديل البيانات' : 'إضافة ابن جديد';

  const canEditPhoto = mode === 'edit' && node != null;
  const hasPhoto = Boolean(node?.photoUrls);

  // ── Photo handlers (edit mode only) ─────────────────────────
  const onPickFile = () => {
    setPhotoErr('');
    setConfirmRemove(false);
    fileInputRef.current?.click();
  };

  const onFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size === 0) return setPhotoErr('الملف فارغ');
    if (file.size > MAX_BYTES) return setPhotoErr('حجم الصورة يتجاوز الحد المسموح به (5MB)');
    const typeErr = validateFileType(file);
    if (typeErr) return setPhotoErr(typeErr);

    setPhotoBusy(true);
    setPhotoErr('');
    try {
      await onUploadPhoto(file);
    } catch (err: any) {
      setPhotoErr(err?.message ?? 'تعذّر رفع الصورة');
    } finally {
      setPhotoBusy(false);
    }
  };

  const onRemove = async () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setPhotoBusy(true);
    setPhotoErr('');
    try {
      await onDeletePhoto();
      setConfirmRemove(false);
    } catch (err: any) {
      setPhotoErr(err?.message ?? 'تعذّر حذف الصورة');
    } finally {
      setPhotoBusy(false);
    }
  };

  // ── Pieces shared by view + edit ─────────────────────────────
  const previewNode = {
    name: form.name || node?.name || '',
    // In edit/add mode the live form drives the fallback glyph colour; in view
    // mode we always use the saved value.
    sex: mode === 'view' ? node?.sex ?? form.sex : form.sex,
    photoUrls: node?.photoUrls ?? null,
  };

  const photoBlock = (
    <div className="photo-block">
      <div className={`photo-preview${photoBusy ? ' busy' : ''}`}>
        <Avatar
          node={previewNode}
          variant="medium"
          size={96}
          onClick={hasPhoto ? () => setLightboxOpen(true) : undefined}
        />
        {photoBusy && <div className="photo-spinner" aria-hidden="true" />}
      </div>
      <div className="photo-actions">
        {mode === 'edit' && (
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_HINT}
            hidden
            onChange={onFileChosen}
          />
        )}
        {canEditPhoto && (
          <>
            <button
              type="button"
              className="btn photo-btn"
              onClick={onPickFile}
              disabled={photoBusy || busy}
            >
              <Camera size={14} />
              <span>{hasPhoto ? 'تغيير الصورة' : 'رفع صورة'}</span>
            </button>
            {hasPhoto && (
              <button
                type="button"
                className={`btn photo-btn${confirmRemove ? ' btn-danger' : ''}`}
                onClick={onRemove}
                disabled={photoBusy || busy}
              >
                <Trash2 size={14} />
                <span>{confirmRemove ? 'تأكيد الحذف' : 'حذف الصورة'}</span>
              </button>
            )}
          </>
        )}
        {mode === 'add' && (
          <div className="photo-hint">
            احفظ البيانات أولاً ثم يمكنك رفع صورة لهذا الشخص.
          </div>
        )}
        {photoErr && <div className="photo-err">{photoErr}</div>}
      </div>
    </div>
  );

  // ── View body ────────────────────────────────────────────────
  const viewBody = node && (
    <>
      {photoBlock}
      <ViewField label="الاسم" value={node.name} />
      <ViewField label="الجنس" value={node.sex === 'female' ? '♀ أنثى' : '♂ ذكر'} />
      <DatesAndAge node={node} />
      <ViewField label="السيرة الذاتية" value={node.bio || '—'} multiline />
      <ViewField
        label="البريد الإلكتروني"
        value={
          node.email ? (
            <a href={`mailto:${node.email}`} style={{ color: '#8b4a1a' }}>
              {node.email}
            </a>
          ) : (
            '—'
          )
        }
      />
    </>
  );

  // ── Edit / add body ──────────────────────────────────────────
  const formBody = (
    <>
      {photoBlock}
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
    </>
  );

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

        <div className="drawer-body">{mode === 'view' ? viewBody : formBody}</div>

        <div className="drawer-footer">
          {mode === 'view' && (
            <>
              {unlocked && onEnterEdit && (
                <button className="btn btn-primary" onClick={onEnterEdit}>
                  <Pencil size={14} style={{ marginInlineEnd: 6 }} />
                  تعديل
                </button>
              )}
              <button className="btn" onClick={onClose}>إغلاق</button>
            </>
          )}
          {(mode === 'edit' || mode === 'add') && (
            <>
              <button
                className="btn btn-primary"
                disabled={!form.name?.trim() || busy}
                onClick={() => onSave()}
              >
                {busy ? 'جارٍ الحفظ...' : 'حفظ'}
              </button>
              <button
                className="btn"
                onClick={() => {
                  // From edit-after-view we pop back to view; from add or
                  // direct-edit we just close.
                  if (mode === 'edit' && onCancelEdit) onCancelEdit();
                  else onClose();
                }}
                disabled={busy}
              >
                إلغاء
              </button>
            </>
          )}
        </div>
      </div>

      {lightboxOpen && node?.photoUrls?.original && (
        <Lightbox
          src={node.photoUrls.original}
          alt={node.name}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}

// ── Small read-only helpers ────────────────────────────────────

function ViewField({
  label,
  value,
  multiline,
}: {
  label: string;
  value: React.ReactNode;
  multiline?: boolean;
}) {
  return (
    <div>
      <div className="field-label">{label}</div>
      <div
        style={{
          fontSize: 15,
          color: '#2a1a0a',
          lineHeight: 1.55,
          whiteSpace: multiline ? 'pre-wrap' : 'normal',
          wordBreak: 'break-word',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DatesAndAge({ node }: { node: FamilyNode }) {
  const age = ageYears(node.born, node.died);
  const range = formatRange(node.born, node.died);
  const deceased = isDeceasedFn(node.born, node.died);
  if (!range && age === null) return null;
  return (
    <div>
      <div className="field-label">التواريخ</div>
      <div style={{ fontSize: 15, color: '#2a1a0a', lineHeight: 1.55 }}>
        {range || '—'}
        {age !== null && (
          <span style={{ color: '#888', marginInlineStart: 8, fontSize: 13 }}>
            ({age} سنة)
          </span>
        )}
        {deceased && (
          <span
            style={{
              color: '#a07428',
              fontStyle: 'italic',
              fontSize: 12,
              marginInlineStart: 8,
            }}
          >
            رحمة الله
          </span>
        )}
      </div>
    </div>
  );
}
