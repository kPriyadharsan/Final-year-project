export function PageContainer({
  title,
  subtitle,
  badge,
  breadcrumbs = [],
  actions,
  children,
  className = '',
  maxWidth = 'max-w-7xl',
}) {
  return (
    <div className={`p-4 sm:p-6 lg:p-8 space-y-6 ${maxWidth} mx-auto w-full ${className}`}>
      {/* Page Header (if title or actions are provided) */}
      {(title || actions || breadcrumbs.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-slate-800/60">
          <div className="space-y-1">
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-xs text-slate-400 font-mono mb-1">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center space-x-2">
                    {idx > 0 && <span className="text-slate-600">/</span>}
                    {crumb.href ? (
                      <a href={crumb.href} className="hover:text-slate-200 transition-colors">
                        {crumb.label}
                      </a>
                    ) : (
                      <span className="text-slate-300 font-medium">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {/* Title & Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              {title && (
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {title}
                </h1>
              )}
              {badge && <div>{badge}</div>}
            </div>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-sm text-slate-400 font-normal">
                {subtitle}
              </p>
            )}
          </div>

          {/* Action buttons slot */}
          {actions && (
            <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Main Page Content Body */}
      <div>{children}</div>
    </div>
  )
}
