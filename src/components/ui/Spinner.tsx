import React from 'react';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'white' | 'gray';
  className?: string;
}

/**
 * A CSS-only spinner component using Tailwind CSS
 */
const Spinner: React.FC<SpinnerProps> = ({ 
  size = 'md', 
  color = 'primary',
  className = ''
}) => {
  // Size classes
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4'
  };
  
  // Color classes
  const colorClasses = {
    primary: 'border-indigo-600 border-t-transparent',
    white: 'border-white border-t-transparent',
    gray: 'border-neutral-400 border-t-transparent'
  };
  
  return (
    <div 
      className={`
        inline-block animate-spin rounded-full 
        ${sizeClasses[size]} 
        ${colorClasses[color]} 
        ${className}
      `}
      role="status"
      aria-label="Loading"
    />
  );
};

export default Spinner; 