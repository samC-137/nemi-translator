
import React from 'react';

export const Logo: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const widths = {
    sm: 'w-28',
    md: 'w-44',
    lg: 'w-64'
  };

  return (
    <div className="flex items-center select-none">
      <img
        src="/images/Logo.png"
        alt="NEMI"
        className={`${widths[size]} h-auto`}
      />
    </div>
  );
};
