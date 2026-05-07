import { useState, type MouseEvent as ReactMouseEvent, type Ref } from 'react';
import type { FamilyNode } from '../types';
import {
  NODE_W,
  NODE_H,
  type NodePosition,
  getDescendants,
} from '../hooks/useTreeLayout';
import TreeNode from './TreeNode';
import Connectors from './Connectors';

interface Props {
  nodes: FamilyNode[];
  positions: Record<number, NodePosition>;
  hiddenIds: Set<number>;
  bounds: { w: number; h: number };
  collapsed: Set<number>;
  selected: number | null;
  ancestorIds: Set<number>;
  setSelected: (id: number | null) => void;
  onEdit: (id: number) => void;
  onAdd: (parentId: number) => void;
  onDelete: (id: number) => void;
  onToggleCollapse: (id: number) => void;
  unlocked: boolean;
  offset: { x: number; y: number };
  scale: number;
  isDragging: boolean;
  isWheeling: boolean;
  containerRef: Ref<HTMLDivElement>;
  onMouseDown: (e: ReactMouseEvent) => void;
  onMouseMove: (e: ReactMouseEvent) => void;
  onMouseUp: () => void;
  onCanvasClick: (e: ReactMouseEvent) => void;
}

export default function TreeCanvas({
  nodes,
  positions,
  hiddenIds,
  bounds,
  collapsed,
  selected,
  ancestorIds,
  setSelected,
  onEdit,
  onAdd,
  onDelete,
  onToggleCollapse,
  unlocked,
  offset,
  scale,
  isDragging,
  isWheeling,
  containerRef,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onCanvasClick,
}: Props) {
  const [hovered, setHovered] = useState<number | null>(null);

  const transition = isDragging || isWheeling
    ? 'none'
    : 'transform 0.18s cubic-bezier(0.25,0.1,0.25,1)';

  const childrenCount = (id: number) => nodes.filter((n) => n.parentId === id).length;

  return (
    <div
      ref={containerRef}
      className={`canvas-wrap${isDragging ? ' dragging' : ''}`}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onClick={onCanvasClick}
    >
      <div
        className="canvas-inner"
        style={{
          transform: `translate(${offset.x}px,${offset.y}px) scale(${scale})`,
          width: bounds.w,
          height: bounds.h,
          transition,
        }}
      >
        <Connectors
          nodes={nodes}
          positions={positions}
          hiddenIds={hiddenIds}
          bounds={bounds}
          selected={selected}
          ancestorIds={ancestorIds}
        />
        {nodes
          .filter((n) => !hiddenIds.has(n.id))
          .map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const isSelected = selected === node.id;
            const isAncestor = ancestorIds.has(node.id);
            const isDimmed = selected != null && !isSelected && !isAncestor;
            const isCollapsed = collapsed.has(node.id);
            const hasChildren = childrenCount(node.id) > 0 || nodes.some((n) => n.parentId === node.id);
            const descCount = isCollapsed ? getDescendants(node.id, nodes).length : 0;
            return (
              <TreeNode
                key={node.id}
                node={node}
                pos={pos}
                isSelected={isSelected}
                isAncestor={isAncestor}
                isDimmed={isDimmed}
                isHovered={hovered === node.id}
                isCollapsed={isCollapsed}
                hasChildren={hasChildren}
                descCount={descCount}
                unlocked={unlocked}
                onHover={setHovered}
                onClick={(id) => setSelected(isSelected ? null : id)}
                onEdit={onEdit}
                onAdd={onAdd}
                onDelete={onDelete}
                onToggleCollapse={onToggleCollapse}
              />
            );
          })}
      </div>
    </div>
  );
}
