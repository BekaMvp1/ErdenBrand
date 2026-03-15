/**
 * Унифицированный инпут для тёмной неоновой темы.
 * Поддерживает ref для навигации по сетке (стрелки).
 */

import { forwardRef } from 'react';

const NeonInput = forwardRef(function NeonInput({ className = '', ...props }, ref) {
  return (
    <input
      ref={ref}
      className={`input-neon w-full px-4 py-2.5 text-sm ${className}`}
      {...props}
    />
  );
});

export default NeonInput;
