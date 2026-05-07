import type { FamilyNode } from '../types';
import { NODE_H, type NodePosition } from '../hooks/useTreeLayout';

interface Props {
  nodes: FamilyNode[];
  positions: Record<number, NodePosition>;
  hiddenIds: Set<number>;
  bounds: { w: number; h: number };
  selected: number | null;
  ancestorIds: Set<number>;
}

export default function Connectors({ nodes, positions, hiddenIds, bounds, selected, ancestorIds }: Props) {
  const onPath = (childId: number) =>
    selected != null && (childId === selected || ancestorIds.has(childId));

  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: bounds.w,
        height: bounds.h,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      {nodes
        .filter((n) => n.parentId != null && !hiddenIds.has(n.id))
        .map((node) => {
          const cp = positions[node.id];
          const pp = node.parentId != null ? positions[node.parentId] : undefined;
          if (!cp || !pp) return null;
          const x1 = pp.cx;
          const y1 = pp.y + NODE_H;
          const x2 = cp.cx;
          const y2 = cp.y;
          const my = (y1 + y2) / 2;
          const lit = onPath(node.id);
          const dimmed = selected != null && !lit;
          return (
            <path
              key={node.id}
              d={`M${x1} ${y1} C${x1} ${my},${x2} ${my},${x2} ${y2}`}
              stroke={lit ? '#8b1a1a' : '#d8d0c8'}
              strokeWidth={lit ? 2.5 : 1.5}
              fill="none"
              strokeDasharray={lit ? 'none' : '6 5'}
              opacity={dimmed ? 0.15 : 1}
              style={{ transition: 'stroke 0.2s, opacity 0.2s' }}
            />
          );
        })}
    </svg>
  );
}
