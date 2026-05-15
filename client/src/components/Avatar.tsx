import type { CSSProperties } from 'react';
import type { FamilyNode, PhotoVariant } from '../types';

interface Props {
  node: Pick<FamilyNode, 'sex' | 'photoUrls' | 'name'>;
  /** Which variant to render. Defaults to thumb (used on tree cards). */
  variant?: PhotoVariant;
  size?: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Circular avatar for a family member.
 *
 * - Renders the appropriate photo variant when `photoUrls` is set.
 * - Falls back to a parchment-tinted circle with the sex glyph (♂/♀)
 *   for nodes without a picture.
 */
export default function Avatar({
  node,
  variant = 'thumb',
  size = 36,
  className,
  onClick,
}: Props) {
  const sexGlyph = node.sex === 'female' ? '♀' : '♂';
  const src = node.photoUrls?.[variant] ?? null;

  const baseStyle: CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    overflow: 'hidden',
    background: '#fdf8f0',
    border: '1.5px solid rgba(160,116,40,0.4)',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: node.sex === 'female' ? '#a23a6e' : '#3a6ba2',
    fontSize: Math.round(size * 0.55),
    lineHeight: 1,
    userSelect: 'none',
    cursor: onClick ? 'pointer' : undefined,
  };

  const clickableClass = onClick ? 'avatar-clickable' : '';

  if (src) {
    return (
      <span
        className={['avatar', clickableClass, className].filter(Boolean).join(' ')}
        style={baseStyle}
        onClick={onClick}
      >
        <img
          src={src}
          alt={node.name}
          loading="lazy"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    );
  }

  return (
    <span
      className={['avatar', 'avatar-fallback', clickableClass, className].filter(Boolean).join(' ')}
      style={baseStyle}
      onClick={onClick}
      aria-hidden="true"
    >
      {sexGlyph}
    </span>
  );
}
