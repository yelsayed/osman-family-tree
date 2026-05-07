import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { Lock, LockOpen, Maximize2, ZoomIn, ZoomOut } from 'lucide-react';
import type { FamilyNode, NodeFormState } from './types';
import {
  fetchNodes,
  createNode,
  updateNode,
  deleteNode,
  verifyPassword,
} from './api';
import { toIsoDate } from './dateUtils';
import {
  NODE_W,
  NODE_H,
  getDescendants,
} from './hooks/useTreeLayout';
import { useTreeLayout } from './hooks/useTreeLayout';
import { useAncestors } from './hooks/useLineage';
import { usePanZoom } from './hooks/usePanZoom';
import TreeCanvas from './components/TreeCanvas';
import Minimap from './components/Minimap';
import SearchBar from './components/SearchBar';
import EditDrawer from './components/EditDrawer';
import DeleteModal from './components/DeleteModal';
import UnlockModal from './components/UnlockModal';
import StatsPanel from './components/StatsPanel';

type DrawerState =
  | { open: false }
  | { open: true; mode: 'edit'; nodeId: number }
  | { open: true; mode: 'add'; parentId: number };

const emptyForm: NodeFormState = {
  name: '',
  sex: 'male',
  born: '',
  died: '',
  bio: '',
  email: '',
};

export default function App() {
  const [nodes, setNodes] = useState<FamilyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);

  // Session unlock state. The password is held in memory only — never persisted.
  const [sessionPassword, setSessionPassword] = useState<string | null>(null);
  const unlocked = sessionPassword !== null;
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [unlockErr, setUnlockErr] = useState('');
  const [unlockBusy, setUnlockBusy] = useState(false);

  const [drawer, setDrawer] = useState<DrawerState>({ open: false });
  const [form, setForm] = useState<NodeFormState>(emptyForm);
  const [drawerErr, setDrawerErr] = useState('');
  const [drawerBusy, setDrawerBusy] = useState(false);

  const [delTarget, setDelTarget] = useState<number | null>(null);
  const [delErr, setDelErr] = useState('');
  const [delBusy, setDelBusy] = useState(false);

  const [toast, setToast] = useState<string | null>(null);

  const { positions, hiddenIds, bounds } = useTreeLayout(nodes, collapsed);
  const ancestorIds = useAncestors(selected, nodes);

  // Clamp the offset so the user can't drag the tree fully off-screen.
  // We allow a small "edge buffer" so it's clear they're at the boundary,
  // but the tree's bounding box always stays at least this much on-screen.
  const clampOffset = useCallback(
    (off: { x: number; y: number }, atScale: number) => {
      const margin = 120;
      const vw = window.innerWidth;
      const vh = window.innerHeight - 52;
      const treeW = bounds.w * atScale;
      const treeH = bounds.h * atScale;
      // x: when offset.x is large positive, the canvas is shoved to the right;
      // we cap so the right edge of the tree stays at least `margin` px on screen.
      const minX = margin - treeW;
      const maxX = vw - margin;
      const minY = margin - treeH;
      const maxY = vh - margin;
      // If the tree is smaller than the viewport in some axis, just allow free panning.
      const x = treeW + 2 * margin <= vw ? off.x : Math.min(maxX, Math.max(minX, off.x));
      const y = treeH + 2 * margin <= vh ? off.y : Math.min(maxY, Math.max(minY, off.y));
      return { x, y };
    },
    [bounds.w, bounds.h],
  );

  const {
    containerRef,
    offset,
    setOffset,
    scale,
    setScale,
    isDragging,
    isWheeling,
    onMouseDown,
    onMouseMove,
    stopDrag,
    smoothZoom,
    wasDragged,
  } = usePanZoom({ initialScale: 0.75, clampOffset });

  // Initial load
  useEffect(() => {
    let alive = true;
    fetchNodes()
      .then((data) => {
        if (!alive) return;
        setNodes(data);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setLoadError(e.message ?? 'فشل التحميل');
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Auto-center on root once positions are computed
  const didFit = useRef(false);
  useEffect(() => {
    if (didFit.current || loading || nodes.length === 0) return;
    const root = nodes.find((n) => n.parentId === null);
    if (!root || !positions[root.id]) return;
    const pos = positions[root.id];
    const s = 0.75;
    const vw = window.innerWidth;
    setScale(s);
    setOffset({
      x: vw / 2 - (pos.x + NODE_W / 2) * s,
      y: 60 - pos.y * s,
    });
    didFit.current = true;
  }, [positions, nodes, loading, setOffset, setScale]);

  // Toast lifecycle
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Unlock / lock ───────────────────────────────────────────
  const tryUnlock = useCallback(async (pw: string) => {
    setUnlockBusy(true);
    setUnlockErr('');
    try {
      const ok = await verifyPassword(pw);
      if (!ok) {
        setUnlockErr('كلمة المرور غير صحيحة');
        return;
      }
      setSessionPassword(pw);
      setUnlockOpen(false);
      setToast('تم فتح القفل — يمكنك الآن التعديل');
    } catch (e: any) {
      setUnlockErr(e.message ?? 'حدث خطأ');
    } finally {
      setUnlockBusy(false);
    }
  }, []);

  const lock = useCallback(() => {
    setSessionPassword(null);
    // Close any open mutation UI when locking
    setDrawer({ open: false });
    setDelTarget(null);
    setToast('تم قفل الشجرة');
  }, []);

  const fitToScreen = useCallback(() => {
    const ps = Object.values(positions);
    if (!ps.length) return;
    const xs = ps.map((p) => p.x);
    const ys = ps.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs) + NODE_W;
    const maxY = Math.max(...ys) + NODE_H;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 52;
    const s = Math.min(1, Math.min(vw / (maxX - minX + 120), vh / (maxY - minY + 120)));
    setScale(s);
    setOffset({
      x: (vw - (maxX - minX) * s) / 2 - minX * s,
      y: (vh - (maxY - minY) * s) / 2 - minY * s + 8,
    });
  }, [positions, setOffset, setScale]);

  const navigateTo = useCallback(
    (id: number) => {
      const pos = positions[id];
      if (!pos) return;
      const s = Math.max(scale, 0.75);
      const vw = window.innerWidth;
      const vh = window.innerHeight - 52;
      setScale(s);
      setOffset({
        x: vw / 2 - (pos.x + NODE_W / 2) * s,
        y: vh / 2 - (pos.y + NODE_H / 2) * s,
      });
      setSelected(id);
    },
    [positions, scale, setOffset, setScale],
  );

  const onCanvasClick = useCallback(
    (e: ReactMouseEvent) => {
      // If the user just finished a pan-drag, treat the implicit click as a no-op
      // and keep the current selection.
      if (wasDragged()) return;
      const target = e.target as HTMLElement;
      if (!target.closest('.tree-node')) setSelected(null);
    },
    [wasDragged],
  );

  // ── Mutation actions (only enabled when unlocked) ──────────
  const openEdit = useCallback(
    (id: number) => {
      if (!unlocked) return;
      const n = nodes.find((x) => x.id === id);
      if (!n) return;
      setForm({
        name: n.name,
        sex: n.sex,
        born: toIsoDate(n.born),
        died: toIsoDate(n.died),
        bio: n.bio,
        email: n.email,
      });
      setDrawerErr('');
      setDrawerBusy(false);
      setDrawer({ open: true, mode: 'edit', nodeId: id });
    },
    [nodes, unlocked],
  );

  const openAdd = useCallback(
    (parentId: number) => {
      if (!unlocked) return;
      setForm({ ...emptyForm });
      setDrawerErr('');
      setDrawerBusy(false);
      setDrawer({ open: true, mode: 'add', parentId });
    },
    [unlocked],
  );

  const closeDrawer = () => {
    setDrawer({ open: false });
    setDrawerErr('');
    setDrawerBusy(false);
  };

  const saveDrawer = useCallback(async () => {
    if (!drawer.open) return;
    if (!sessionPassword) {
      setDrawerErr('الجلسة مقفلة. أعد فتح القفل.');
      return;
    }
    setDrawerBusy(true);
    setDrawerErr('');
    const born = form.born ? form.born : null;
    const died = form.died ? form.died : null;
    try {
      if (drawer.mode === 'edit') {
        const updated = await updateNode(drawer.nodeId, {
          password: sessionPassword,
          name: form.name.trim(),
          sex: form.sex,
          born,
          died,
          bio: form.bio,
          email: form.email,
        });
        setNodes((prev) => prev.map((n) => (n.id === drawer.nodeId ? updated : n)));
        setToast('تم حفظ التعديلات');
      } else {
        const created = await createNode({
          password: sessionPassword,
          parentId: drawer.parentId,
          name: form.name.trim(),
          sex: form.sex,
          born,
          died,
          bio: form.bio,
          email: form.email,
        });
        setNodes((prev) => [...prev, created]);
        setToast('تمت الإضافة');
      }
      closeDrawer();
    } catch (e: any) {
      const msg = e.message ?? 'حدث خطأ';
      setDrawerErr(msg);
      // If the password was rotated server-side while we were unlocked, force re-unlock
      if (msg.includes('كلمة المرور')) setSessionPassword(null);
      setDrawerBusy(false);
    }
  }, [drawer, form, sessionPassword]);

  const toggleCollapse = useCallback((id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openDelete = useCallback(
    (id: number) => {
      if (!unlocked) return;
      setDelTarget(id);
      setDelErr('');
      setDelBusy(false);
    },
    [unlocked],
  );

  const doDelete = useCallback(async () => {
    if (delTarget == null) return;
    if (!sessionPassword) {
      setDelErr('الجلسة مقفلة. أعد فتح القفل.');
      return;
    }
    setDelBusy(true);
    setDelErr('');
    try {
      const deleted = await deleteNode(delTarget, sessionPassword);
      const set = new Set(deleted);
      setNodes((prev) => prev.filter((n) => !set.has(n.id)));
      setSelected(null);
      setDelTarget(null);
      setToast(`تم حذف ${deleted.length} عنصر`);
    } catch (e: any) {
      const msg = e.message ?? 'حدث خطأ';
      setDelErr(msg);
      if (msg.includes('كلمة المرور')) setSessionPassword(null);
    } finally {
      setDelBusy(false);
    }
  }, [delTarget, sessionPassword]);

  const delTargetNode = useMemo(
    () => (delTarget == null ? null : nodes.find((n) => n.id === delTarget) ?? null),
    [delTarget, nodes],
  );
  const delTargetCount = useMemo(
    () => (delTarget == null ? 0 : getDescendants(delTarget, nodes).length),
    [delTarget, nodes],
  );

  if (loading) {
    return <div className="loading-screen">جارٍ التحميل...</div>;
  }
  if (loadError) {
    return (
      <div className="loading-screen">
        تعذّر الاتصال بالخادم: {loadError}
      </div>
    );
  }

  return (
    <>
      <div className="header">
        {/* Actions group — sits on the visual LEFT in this RTL layout. */}
        <div className="header-actions">
          {unlocked ? (
            <button
              className="btn lock-btn lock-btn-unlocked"
              onClick={lock}
              title="قفل الشجرة (إيقاف وضع التعديل)"
            >
              <LockOpen size={14} />
              <span>مفتوح — اضغط للقفل</span>
            </button>
          ) : (
            <button
              className="btn lock-btn lock-btn-locked"
              onClick={() => {
                setUnlockErr('');
                setUnlockOpen(true);
              }}
              title="فتح القفل لتمكين التعديل"
            >
              <Lock size={14} />
              <span>مقفل — فتح للتعديل</span>
            </button>
          )}
          <button className="zoom-btn" onClick={() => smoothZoom(1.25)} title="تكبير">
            <ZoomIn size={16} />
          </button>
          <span style={{ fontSize: 13, color: '#888', minWidth: 42, textAlign: 'center' }}>
            {Math.round(scale * 100)}٪
          </span>
          <button className="zoom-btn" onClick={() => smoothZoom(0.8)} title="تصغير">
            <ZoomOut size={16} />
          </button>
          <button
            className="btn"
            onClick={fitToScreen}
            style={{ fontSize: 13, padding: '5px 12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            title="ملاءمة الشاشة"
          >
            <Maximize2 size={14} />
            ملاءمة
          </button>
        </div>

        {/* Centered basmala glyph (U+FDFD) — independent of flex children. */}
        <span className="header-basmala" aria-label="بسم الله الرحمن الرحيم">﷽</span>

        {/* Title group — pinned to the right. */}
        <div className="header-title-group">
          <span style={{ fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>
            شجرة آل عثمان بحيري
          </span>
          <SearchBar nodes={nodes} onSelect={navigateTo} />
        </div>
      </div>

      <TreeCanvas
        nodes={nodes}
        positions={positions}
        hiddenIds={hiddenIds}
        bounds={bounds}
        collapsed={collapsed}
        selected={selected}
        ancestorIds={ancestorIds}
        setSelected={setSelected}
        onEdit={openEdit}
        onAdd={openAdd}
        onDelete={openDelete}
        onToggleCollapse={toggleCollapse}
        unlocked={unlocked}
        offset={offset}
        scale={scale}
        isDragging={isDragging}
        isWheeling={isWheeling}
        containerRef={containerRef}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={stopDrag}
        onCanvasClick={onCanvasClick}
      />

      <div className="bottom-left-stack">
        <StatsPanel nodes={nodes} />
        <Minimap
          nodes={nodes}
          positions={positions}
          hiddenIds={hiddenIds}
          bounds={bounds}
          offset={offset}
          setOffset={setOffset}
          scale={scale}
        />
      </div>

      {drawer.open && (
        <EditDrawer
          mode={drawer.mode}
          form={form}
          setForm={setForm}
          onSave={saveDrawer}
          onClose={closeDrawer}
          error={drawerErr}
          busy={drawerBusy}
        />
      )}

      {delTarget != null && (
        <DeleteModal
          node={delTargetNode}
          descCount={delTargetCount}
          onConfirm={doDelete}
          onCancel={() => {
            setDelTarget(null);
            setDelErr('');
          }}
          error={delErr}
          busy={delBusy}
        />
      )}

      {unlockOpen && (
        <UnlockModal
          onSubmit={tryUnlock}
          onCancel={() => {
            setUnlockOpen(false);
            setUnlockErr('');
          }}
          error={unlockErr}
          busy={unlockBusy}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
