import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown } from 'lucide-react';
import type { FamilyNode } from '../types';
import { isDeceased as isDeceasedFn } from '../dateUtils';

interface Props {
  nodes: FamilyNode[];
}

interface Stats {
  total: number;
  males: number;
  females: number;
  alive: number;
  deceased: number;
}

function computeStats(nodes: FamilyNode[]): Stats {
  let males = 0;
  let females = 0;
  let alive = 0;
  let deceased = 0;
  for (const n of nodes) {
    if (n.sex === 'female') females++;
    else males++;
    if (isDeceasedFn(n.born, n.died)) deceased++;
    else alive++;
  }
  return { total: nodes.length, males, females, alive, deceased };
}

export default function StatsPanel({ nodes }: Props) {
  const [open, setOpen] = useState(false); // collapsed by default
  const stats = useMemo(() => computeStats(nodes), [nodes]);

  if (!open) {
    return (
      <button
        className="stats-toggle"
        onClick={() => setOpen(true)}
        onMouseDown={(e) => e.stopPropagation()}
        title="عرض الإحصائيات"
      >
        <BarChart3 size={14} />
        <span>إحصائيات</span>
      </button>
    );
  }

  return (
    <div className="stats-panel" onMouseDown={(e) => e.stopPropagation()}>
      <div className="stats-header">
        <span className="stats-title">الإحصائيات</span>
        <button
          className="stats-close"
          onClick={() => setOpen(false)}
          title="إخفاء"
          aria-label="إخفاء"
        >
          <ChevronDown size={14} />
        </button>
      </div>
      <Row label="إجمالي الأفراد" value={stats.total} accent="#a07428" />
      <Row label="الذكور" value={stats.males} accent="#1f6f8b" />
      <Row label="الإناث" value={stats.females} accent="#a8417a" />
      <Row label="الأحياء" value={stats.alive} accent="#2d6b3a" />
      <Row label="المتوفّون" value={stats.deceased} accent="#8b1a1a" />
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="stats-row">
      <span className="stats-row-label">{label}</span>
      <span className="stats-row-value" style={{ color: accent }}>{value}</span>
    </div>
  );
}
