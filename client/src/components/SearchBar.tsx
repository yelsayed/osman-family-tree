import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import type { FamilyNode } from '../types';
import { yearOf } from '../dateUtils';

interface Props {
  nodes: FamilyNode[];
  onSelect: (id: number) => void;
}

export default function SearchBar({ nodes, onSelect }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);

  const results = useMemo(() => {
    const term = q.trim();
    if (!term) return [];
    return nodes.filter((n) => n.name.includes(term)).slice(0, 8);
  }, [q, nodes]);

  useEffect(() => {
    const onClickOut = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOut);
    return () => document.removeEventListener('mousedown', onClickOut);
  }, []);

  const grandLabel = (n: FamilyNode): string | null => {
    if (n.parentId == null) return null;
    const parent = byId.get(n.parentId);
    if (!parent) return null;
    if (parent.parentId == null) return parent.name;
    const gp = byId.get(parent.parentId);
    return gp ? `${parent.name} · ${gp.name}` : parent.name;
  };

  const choose = (id: number) => {
    onSelect(id);
    setQ('');
    setOpen(false);
  };

  return (
    <div className="search-wrap" ref={wrapRef}>
      <div style={{ position: 'relative' }}>
        <Search
          size={16}
          style={{
            position: 'absolute',
            top: '50%',
            left: 12,
            transform: 'translateY(-50%)',
            color: '#a07428',
            pointerEvents: 'none',
          }}
        />
        <input
          className="search-input"
          style={{ paddingLeft: 32 }}
          placeholder="ابحث عن شخص..."
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && results[0]) choose(results[0].id);
          }}
        />
      </div>
      {open && q.trim() && results.length > 0 && (
        <div className="search-dropdown">
          {results.map((n) => {
            const gp = grandLabel(n);
            const isFem = n.sex === 'female';
            return (
              <div key={n.id} className="search-result" onMouseDown={() => choose(n.id)}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{n.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#8b1a1a',
                      background: '#fff0f0',
                      padding: '1px 7px',
                      borderRadius: 20,
                    }}
                  >
                    {isFem ? '♀ أنثى' : '♂ ذكر'}
                  </span>
                  {yearOf(n.born) != null && (
                    <span style={{ fontSize: 12, color: '#a07428' }}>{yearOf(n.born)}</span>
                  )}
                </div>
                {gp && (
                  <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>تحت: {gp}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {open && q.trim() && results.length === 0 && (
        <div className="search-dropdown">
          <div className="search-empty">لا توجد نتائج</div>
        </div>
      )}
    </div>
  );
}
