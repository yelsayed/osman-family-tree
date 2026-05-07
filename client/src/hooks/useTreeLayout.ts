import { useMemo } from 'react';
import type { FamilyNode } from '../types';

export const NODE_W = 200;
export const NODE_H = 86;
export const H_GAP = 44;
export const V_GAP = 84;

export interface NodePosition {
  x: number;
  y: number;
  cx: number;
}

export interface LayoutResult {
  positions: Record<number, NodePosition>;
  hiddenIds: Set<number>;
  bounds: { w: number; h: number };
}

export function getDescendants(id: number, nodes: FamilyNode[]): number[] {
  const ch = nodes.filter((n) => n.parentId === id);
  return ch.flatMap((c) => [c.id, ...getDescendants(c.id, nodes)]);
}

/** Recursively compute layout: top-down, parent centered over children. */
export function computeLayout(nodes: FamilyNode[], collapsed: Set<number>): LayoutResult {
  const LEVEL_H = NODE_H + V_GAP;
  const hiddenIds = new Set<number>();
  collapsed.forEach((id) => getDescendants(id, nodes).forEach((d) => hiddenIds.add(d)));
  const vis = nodes.filter((n) => !hiddenIds.has(n.id));

  const childrenIndex = new Map<number | null, FamilyNode[]>();
  for (const n of vis) {
    const arr = childrenIndex.get(n.parentId) ?? [];
    arr.push(n);
    childrenIndex.set(n.parentId, arr);
  }

  const subtreeWCache = new Map<number, number>();
  function subtreeW(id: number): number {
    const cached = subtreeWCache.get(id);
    if (cached !== undefined) return cached;
    if (collapsed.has(id)) {
      subtreeWCache.set(id, NODE_W + H_GAP);
      return NODE_W + H_GAP;
    }
    const ch = childrenIndex.get(id) ?? [];
    if (!ch.length) {
      subtreeWCache.set(id, NODE_W + H_GAP);
      return NODE_W + H_GAP;
    }
    const total = ch.reduce((s, c) => s + subtreeW(c.id), 0);
    subtreeWCache.set(id, total);
    return total;
  }

  const positions: Record<number, NodePosition> = {};
  function place(id: number, startX: number, y: number): void {
    const ch = childrenIndex.get(id) ?? [];
    if (!ch.length || collapsed.has(id)) {
      const cx = startX + NODE_W / 2;
      positions[id] = { x: startX, y, cx };
      return;
    }
    let curX = startX;
    const cxArr: number[] = [];
    for (const c of ch) {
      const w = subtreeW(c.id);
      place(c.id, curX, y + LEVEL_H);
      cxArr.push(curX + w / 2);
      curX += w;
    }
    const pcx = (cxArr[0] + cxArr[cxArr.length - 1]) / 2;
    positions[id] = { x: pcx - NODE_W / 2, y, cx: pcx };
  }

  const root = nodes.find((n) => n.parentId === null);
  if (root) place(root.id, 60, 60);

  const xs = Object.values(positions).map((p) => p.x + NODE_W);
  const ys = Object.values(positions).map((p) => p.y + NODE_H);
  const bounds = {
    w: (xs.length ? Math.max(...xs) : 0) + 120,
    h: (ys.length ? Math.max(...ys) : 0) + 120,
  };

  return { positions, hiddenIds, bounds };
}

export function useTreeLayout(nodes: FamilyNode[], collapsed: Set<number>): LayoutResult {
  return useMemo(() => computeLayout(nodes, collapsed), [nodes, collapsed]);
}
