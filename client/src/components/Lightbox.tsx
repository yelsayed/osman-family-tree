import { useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  src: string;
  alt: string;
  onClose: () => void;
}

/**
 * Minimal photo lightbox. Click anywhere outside the image (or the close
 * button, or press Esc) to dismiss. Intentionally no zoom / pan / slideshow —
 * this is a "show me the actual picture" affordance, nothing more.
 */
export default function Lightbox({ src, alt, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll while the lightbox is up. Restore on unmount.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <button
        className="lightbox-close"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="إغلاق"
        type="button"
      >
        <X size={22} />
      </button>
      <img
        className="lightbox-image"
        src={src}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
