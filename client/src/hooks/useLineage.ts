import { useMemo } from 'react';
import type { FamilyNode } from '../types';

/** Returns the set of ancestor IDs (excluding the selected node itself). */
export function useAncestors(selected: number | null, nodes: FamilyNode[]): Set<number> {
  return useMemo(() => {
    const set = new Set<number>();
    if (selected == null) return set;
    const byId = new Map(nodes.map((n) => [n.id, n] as const));
    let cur = byId.get(selected);
    while (cur && cur.parentId != null) {
      set.add(cur.parentId);
      cur = byId.get(cur.parentId);
    }
    return set;
  }, [selected, nodes]);
}
