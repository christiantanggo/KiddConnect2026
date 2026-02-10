'use client';

/**
 * ResponsiveCard - A mobile-responsive card component
 * Adapts padding and layout for different screen sizes
 */
export default function ResponsiveCard({ 
  children, 
  className = '', 
  title,
  actions,
  padding = 'default'
}) {
  const paddingClasses = {
    none: '',
    small: 'p-4',
    default: 'p-6',
    large: 'p-8',
  };

  return (
    <div className={`bg-white rounded-lg shadow ${paddingClasses[padding]} ${className}`}>
      {(title || actions) && (
        <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
          {title && (
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          )}
          {actions && (
            <div className="flex gap-2">{actions}</div>
          )}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
}



















