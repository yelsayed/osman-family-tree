import { useCallback, useRef, useState, type MouseEvent } from 'react';

export interface Offset { x: number; y: number; }

interface PanZoomOptions {
  initialScale?: number;
  minScale?: number;
  maxScale?: number;
  /** Optional clamp applied after every offset change. Receives the scale at that moment. */
  clampOffset?: (off: Offset, scale: number) => Offset;
}

export function usePanZoom(opts: PanZoomOptions = {}) {
  const minScale = opts.minScale ?? 0.2;
  const maxScale = opts.maxScale ?? 2;
  const [offset, setOffsetRaw] = useState<Offset>({ x: 120, y: 20 });
  const [scale, setScale] = useState<number>(opts.initialScale ?? 1);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<Offset | null>(null);

  // Drag distance tracking — used by the consumer to decide if a mouseup-click
  // should clear selection. Reset on every mousedown.
  const dragDistance = useRef(0);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);

  // The container element — kept as a callback ref so consumers can still attach it.
  const containerRef = useCallback((_el: HTMLDivElement | null) => {
    /* no-op: we no longer attach a wheel listener; zoom is button-driven only. */
  }, []);

  // Keep latest clamp in a ref so the long-lived event handlers always pick it up.
  const clampOffsetRef = useRef(opts.clampOffset);
  clampOffsetRef.current = opts.clampOffset;

  // Latest scale, in a ref, for handlers that don't want to re-attach on every scale change.
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const applyClamp = useCallback(
    (off: Offset, atScale: number): Offset =>
      clampOffsetRef.current ? clampOffsetRef.current(off, atScale) : off,
    [],
  );

  const setOffset = useCallback(
    (next: Offset | ((prev: Offset) => Offset)) => {
      setOffsetRaw((prev) => {
        const candidate = typeof next === 'function' ? (next as (p: Offset) => Offset)(prev) : next;
        return applyClamp(candidate, scaleRef.current);
      });
    },
    [applyClamp],
  );

  const clamp = useCallback(
    (v: number) => Math.min(maxScale, Math.max(minScale, v)),
    [minScale, maxScale],
  );

  // Wheel-zoom intentionally removed for now — zoom is button-driven only.

  // Mouse pan
  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.tree-node,.drawer-right,.modal-backdrop,.minimap,.minimap-toggle,.stats-panel,.stats-toggle,.search-wrap,.node-actions')) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
      dragOrigin.current = { x: e.clientX, y: e.clientY };
      dragDistance.current = 0;
    },
    [offset],
  );

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (!dragStart.current) return;
    if (dragOrigin.current) {
      const dx = e.clientX - dragOrigin.current.x;
      const dy = e.clientY - dragOrigin.current.y;
      const d = Math.hypot(dx, dy);
      if (d > dragDistance.current) dragDistance.current = d;
    }
    const candidate = {
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    };
    setOffsetRaw((_prev) => applyClamp(candidate, scaleRef.current));
  }, [applyClamp]);

  const stopDrag = useCallback(() => {
    setIsDragging(false);
    dragStart.current = null;
    dragOrigin.current = null;
  }, []);

  const smoothZoom = useCallback(
    (factor: number) => {
      const vw = window.innerWidth;
      const vh = window.innerHeight - 52;
      const cx = vw / 2;
      const cy = vh / 2;
      setScale((prev) => {
        const next = clamp(prev * factor);
        if (next === prev) return prev;
        setOffsetRaw((off) => {
          const candidate = {
            x: cx - (cx - off.x) * (next / prev),
            y: cy - (cy - off.y) * (next / prev),
          };
          return applyClamp(candidate, next);
        });
        return next;
      });
    },
    [clamp, applyClamp],
  );

  /** Returns the distance of the most recent drag (since the last mousedown). */
  const wasDragged = useCallback((threshold = 4) => dragDistance.current > threshold, []);

  return {
    containerRef,
    offset,
    setOffset,
    scale,
    setScale,
    isDragging,
    /** Kept for API stability; wheel-zoom is currently disabled so it's always false. */
    isWheeling: false,
    onMouseDown,
    onMouseMove,
    stopDrag,
    smoothZoom,
    clamp,
    wasDragged,
  };
}
