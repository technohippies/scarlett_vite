import React, { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  leftIcon?: ReactNode;
  leftLink?: string;
  rightIcon?: ReactNode;
  rightLink?: string;
  title?: string;
  progressPercent?: number;
  onLeftClick?: () => void;
  onRightClick?: () => void;
  className?: string;
}

const PageHeader: React.FC<PageHeaderProps> = ({
  leftIcon,
  leftLink,
  rightIcon,
  rightLink,
  progressPercent,
  onLeftClick,
  onRightClick,
  className = '',
}) => {
  // Render left icon/button
  const renderLeftElement = () => {
    if (!leftIcon) return null;
    
    if (leftLink) {
      return (
        <Link
          to={leftLink}
          className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
        >
          {leftIcon}
        </Link>
      );
    }
    
    if (onLeftClick) {
      return (
        <button
          onClick={onLeftClick}
          className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
        >
          {leftIcon}
        </button>
      );
    }
    
    return <div className="flex-shrink-0">{leftIcon}</div>;
  };
  
  // Render right icon/button
  const renderRightElement = () => {
    if (!rightIcon) return null;
    
    if (rightLink) {
      return (
        <Link
          to={rightLink}
          className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
        >
          {rightIcon}
        </Link>
      );
    }
    
    if (onRightClick) {
      return (
        <button
          onClick={onRightClick}
          className="text-neutral-400 hover:text-white transition-colors flex-shrink-0"
        >
          {rightIcon}
        </button>
      );
    }
    
    return <div className="flex-shrink-0">{rightIcon}</div>;
  };
  
  return (
    <div className={`flex items-center gap-4 mb-6 ${className}`}>
      {renderLeftElement()}
      

      
      {progressPercent !== undefined && (
        <div className="h-2 bg-neutral-800 rounded-full flex-1">
          <div 
            className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}
      
      {renderRightElement()}
    </div>
  );
};

export default PageHeader; 