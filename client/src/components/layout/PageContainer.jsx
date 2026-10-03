export function PageContainer({
  title,
  subtitle,
  badge,
  breadcrumbs = [],
  actions,
  children,
  className = '',
}) {
  return (
    <div className={`space-y-4 sm:space-y-5 w-full ${className}`}>
      {/* Page Header (rendered only when title or actions are provided) */}
      {(title || actions || breadcrumbs.length > 0) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-slate-200/60">
          <div className="space-y-1">
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-[11px] text-slate-400 font-sans">
                {breadcrumbs.map((crumb, idx) => (
                  <span key={idx} className="flex items-center space-x-1.5">
                    {idx > 0 && <span className="text-slate-300">/</span>}
                    {crumb.href ? (
                      <a href={crumb.href} className="hover:text-blue-600 transition-colors">
                        {crumb.label}
                      </a>
                    ) : (
                      <span className="text-slate-600 font-medium">{crumb.label}</span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {/* Title & Badge */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {title && (
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                  {title}
                </h1>
              )}
              {badge && <div>{badge}</div>}
            </div>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 font-normal leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>

          {/* Action buttons slot */}
          {actions && (
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Main Page Content Body */}
      <div className="space-y-4 sm:space-y-5">{children}</div>
    </div>
  )
}
