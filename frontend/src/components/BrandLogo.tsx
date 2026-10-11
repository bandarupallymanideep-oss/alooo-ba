import React from 'react';

interface BrandLogoProps {
  /** tile edge in px (tile variant) or logo width in px (plain variant) */
  size?: number;
  /**
   * tile  - logo on a light rounded tile with a subtle cyan glow (for dark surfaces)
   * plain - logo only (for light surfaces)
   */
  variant?: 'tile' | 'plain';
  className?: string;
}

/** SADARAKSHAK emblem: two opposing star shapes around the AI "eye". */
export const BrandLogo: React.FC<BrandLogoProps> = ({ size = 40, variant = 'tile', className = '' }) => {
  if (variant === 'plain') {
    return (
      <img
        src="/brand/sadarakshak-logo.png"
        alt="SADARAKSHAK"
        width={size}
        style={{ width: size, height: 'auto' }}
        className={`select-none ${className}`}
        draggable={false}
      />
    );
  }
  return (
    <div
      className={`shrink-0 rounded-xl flex items-center justify-center bg-[#f7f9fc] ring-1 ring-[#5fd4ff]/40 shadow-[0_0_18px_rgba(56,189,248,0.28)] ${className}`}
      style={{ width: size, height: size, padding: Math.round(size * 0.1) }}
    >
      <img
        src="/brand/sadarakshak-logo.png"
        alt="SADARAKSHAK"
        className="w-full h-auto select-none"
        draggable={false}
      />
    </div>
  );
};
