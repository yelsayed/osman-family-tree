import type { CSSProperties } from 'react';
import { ChevronDown, ChevronRight, Info, Pencil, Plus, Trash2 } from 'lucide-react';
import type { FamilyNode } from '../types';
import { NODE_W, NODE_H, type NodePosition } from '../hooks/useTreeLayout';
import { ageYears, formatRange, isDeceased as isDeceasedFn } from '../dateUtils';
import Avatar from './Avatar';

interface Props {
  node: FamilyNode;
  pos: NodePosition;
  isSelected: boolean;
  isAncestor: boolean;
  isDimmed: boolean;
  isHovered: boolean;
  isCollapsed: boolean;
  hasChildren: boolean;
  descCount: number;
  unlocked: boolean;
  onHover: (id: number | null) => void;
  onClick: (id: number) => void;
  onView: (id: number) => void;
  onEdit: (id: number) => void;
  onAdd: (parentId: number) => void;
  onDelete: (id: number) => void;
  onToggleCollapse: (id: number) => void;
}

export default function TreeNode({
  node,
  pos,
  isSelected,
  isAncestor,
  isDimmed,
  isHovered,
  isCollapsed,
  hasChildren,
  descCount,
  unlocked,
  onHover,
  onClick,
  onView,
  onEdit,
  onAdd,
  onDelete,
  onToggleCollapse,
}: Props) {
  const isDeceased = isDeceasedFn(node.born, node.died);
  const age = ageYears(node.born, node.died);
  const range = formatRange(node.born, node.died);
  const isFemale = node.sex === 'female';

  const style: CSSProperties = {
    left: pos.x,
    top: pos.y,
    width: NODE_W,
    minHeight: NODE_H,
    padding: '10px 14px',
    opacity: isDimmed ? 0.18 : 1,
    cursor: 'pointer',
    zIndex: isSelected ? 10 : isAncestor ? 5 : isHovered ? 8 : 1,
  };

  return (
    <div
      className={[
        'tree-node',
        isDeceased ? 'deceased' : '',
        isSelected ? 'selected' : '',
        !isSelected && isAncestor ? 'ancestor' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onClick(node.id);
      }}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
    >
      {isHovered && (
        <div className="node-actions">
          <button
            className="action-btn"
            onClick={(e) => {
              e.stopPropagation();
              onView(node.id);
            }}
            title="عرض التفاصيل"
          >
            <Info size={14} />
            <span className="label">تفاصيل</span>
          </button>
          {unlocked && (
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onEdit(node.id);
              }}
              title="تعديل"
            >
              <Pencil size={14} />
              <span className="label">تعديل</span>
            </button>
          )}
          {hasChildren && (
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse(node.id);
              }}
              title={isCollapsed ? 'توسيع' : 'طي'}
            >
              {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
              <span className="label">{isCollapsed ? 'توسيع' : 'طي'}</span>
            </button>
          )}
          {unlocked && (
            <button
              className="action-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(node.id);
              }}
              title="إضافة ابن"
            >
              <Plus size={14} />
              <span className="label">إضافة</span>
            </button>
          )}
          {unlocked && node.parentId != null && (
            <button
              className="action-btn danger"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(node.id);
              }}
              title="حذف"
            >
              <Trash2 size={14} />
              <span className="label">حذف</span>
            </button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Avatar node={node} size={36} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 2 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 15,
                color: isDeceased ? '#999' : '#1a1a1a',
                lineHeight: 1.3,
                display: 'block',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={node.name}
            >
              {node.name}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: '#888',
              display: 'flex',
              gap: 6,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            <span>{isFemale ? '♀ أنثى' : '♂ ذكر'}</span>
            {age !== null && (
              <>
                <span>·</span>
                <span>{age} سنة</span>
              </>
            )}
            {isDeceased && (
              <>
                <span>·</span>
                <span style={{ color: '#a07428', fontStyle: 'italic', fontSize: 11 }}>
                  رحمة الله
                </span>
              </>
            )}
          </div>
          {range && (
            <div style={{ fontSize: 11, color: '#7a5030', marginTop: 2 }}>{range}</div>
          )}
        </div>
      </div>

      {isCollapsed && (
        <div
          className="collapse-badge"
          onClick={(e) => {
            e.stopPropagation();
            onToggleCollapse(node.id);
          }}
        >
          ▶ {descCount} مخفي — انقر للعرض
        </div>
      )}
    </div>
  );
}
