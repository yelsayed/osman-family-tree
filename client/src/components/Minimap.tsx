import { useState, type MouseEvent as ReactMouseEvent } from 'react';
import { Map as MapIcon, ChevronDown } from 'lucide-react';
import type { FamilyNode } from '../types';
import { NODE_W, NODE_H, type NodePosition } from '../hooks/useTreeLayout';

const MM_SCALE = 0.075;

interface Props {
  nodes: FamilyNode[];
  positions: Record<number, NodePosition>;
  hiddenIds: Set<number>;
  bounds: { w: number; h: number };
  offset: { x: number; y: number };
  setOffset: (o: { x: number; y: number }) => void;
  scale: number;
}

export default function Minimap({ nodes, positions, hiddenIds, bounds, offset, setOffset, scale }: Props) {
  const [open, setOpen] = useState(false); // collapsed by default

  const W = Math.max(bounds.w * MM_SCALE, 110);
  const H = Math.max(bounds.h * MM_SCALE, 80);
  const vpW = window.innerWidth * MM_SCALE;
  const vpH = (window.innerHeight - 52) * MM_SCALE;
  const vpX = -offset.x * MM_SCALE / scale;
  const vpY = -offset.y * MM_SCALE / scale;
  const vpWAdj = vpW / scale;
  const vpHAdj = vpH / scale;

  const handleClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const svgX = e.clientX - rect.left;
    const svgY = e.clientY - rect.top;
    const canvasX = svgX / MM_SCALE;
    const canvasY = svgY / MM_SCALE;
    const vw = window.innerWidth;
    const vh = window.innerHeight - 52;
    setOffset({
      x: vw / 2 - canvasX * scale,
      y: vh / 2 - canvasY * scale,
    });
  };

  if (!open) {
    return (
      <button
        className="minimap-toggle"
        onClick={() => setOpen(true)}
        onMouseDown={(e) => e.stopPropagation()}
        title="عرض الخريطة"
      >
        <MapIcon size={14} />
        <span>الخريطة</span>
      </button>
    );
  }

  return (
    <div className="minimap" onMouseDown={(e) => e.stopPropagation()}>
      <div className="minimap-header">
        <span className="minimap-label">الخريطة</span>
        <button
          className="minimap-close"
          onClick={() => setOpen(false)}
          title="إخفاء الخريطة"
          aria-label="إخفاء"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <svg width={W} height={H} onClick={handleClick} style={{ display: 'block' }}>
        <rect x={0} y={0} width={W} height={H} fill="#fdfaf6" />
        {nodes
          .filter((n) => !hiddenIds.has(n.id))
          .map((n) => {
            const p = positions[n.id];
            if (!p) return null;
            return (
              <rect
                key={n.id}
                x={p.x * MM_SCALE}
                y={p.y * MM_SCALE}
                width={NODE_W * MM_SCALE}
                height={NODE_H * MM_SCALE}
                fill="#a07428"
                opacity={0.7}
                rx={1.5}
              />
            );
          })}
        <rect
          x={vpX}
          y={vpY}
          width={vpWAdj}
          height={vpHAdj}
          fill="none"
          stroke="#8b1a1a"
          strokeWidth={1.5}
          rx={2}
        />
      </svg>
    </div>
  );
}
