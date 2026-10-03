/**
 * Apple iOS 27 Liquid Glass & Siri Bento Card Components
 * Neat, gap-free, contiguous modular design inspired by Apple Intelligence & iOS 27.
 */

export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`bg-white/80 backdrop-blur-2xl border border-white/90 rounded-[28px] shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_12px_36px_rgb(0,0,0,0.06)] transition-all duration-300 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ className = '', children, ...rest }) {
  return (
    <div
      className={`p-5 sm:p-6 pb-4 border-b border-slate-100/90 flex items-start justify-between gap-4 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardTitle({ className = '', children, ...rest }) {
  return (
    <h3
      className={`text-base font-bold text-slate-900 tracking-tight ${className}`}
      {...rest}
    >
      {children}
    </h3>
  )
}

export function CardDescription({ className = '', children, ...rest }) {
  return (
    <p
      className={`text-xs text-slate-500 mt-1 leading-relaxed ${className}`}
      {...rest}
    >
      {children}
    </p>
  )
}

export function CardContent({ className = '', children, ...rest }) {
  return (
    <div className={`p-5 sm:p-6 ${className}`} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className = '', children, ...rest }) {
  return (
    <div
      className={`p-5 sm:p-6 pt-4 border-t border-slate-100/90 flex items-center justify-between gap-3 ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * Siri Animated Perimeter Aura Card (Apple Intelligence iOS 27 Style)
 * Displays a multi-colored animated liquid glow border around the card.
 */
export function SiriCard({ className = '', glow = true, children, ...rest }) {
  return (
    <div
      className={`relative siri-aura ${glow ? 'siri-glow' : ''} bg-white/85 backdrop-blur-3xl rounded-[32px] shadow-[0_12px_40px_rgba(0,0,0,0.06)] transition-all duration-300 ${className}`}
      {...rest}
    >
      {/* Specular Liquid Glint */}
      <div className="absolute inset-x-12 top-0 h-[1px] bg-gradient-to-r from-transparent via-white to-transparent pointer-events-none z-10" />
      {children}
    </div>
  )
}

/**
 * Contiguous, Gap-Free Bento Container
 * Groups related modules, tiles, or actions into a single seamless housing.
 */
export function BentoContainer({ className = '', children, ...rest }) {
  return (
    <div
      className={`bg-white/80 backdrop-blur-2xl border border-white/90 rounded-[28px] overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * Contiguous Metric Grid (Replaces scattered StatCards with a neat, gap-free ribbon)
 */
export function ContiguousStatGrid({ items = [], className = '' }) {
  return (
    <BentoContainer className={`grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100/90 ${className}`}>
      {items.map((item, idx) => (
        <div
          key={idx}
          className="p-5 sm:p-6 flex flex-col justify-between hover:bg-slate-50/50 transition-colors group"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                {item.title}
              </span>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {item.value}
              </div>
            </div>
            {item.icon && (
              <div className="w-10 h-10 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-center text-slate-700 shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                {item.icon}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100/80 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 truncate">
              {item.description}
            </span>
            {item.badge && <span className="shrink-0">{item.badge}</span>}
          </div>
        </div>
      ))}
    </BentoContainer>
  )
}

/**
 * Standalone StatCard (backwards compatible)
 */
export function StatCard({
  title,
  value,
  icon,
  description,
  badge,
  className = '',
  ...rest
}) {
  return (
    <Card className={`p-5 sm:p-6 relative overflow-hidden group ${className}`} {...rest}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
            {title}
          </span>
          <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {value}
          </div>
          {description && (
            <p className="text-xs text-slate-500 mt-1">{description}</p>
          )}
        </div>

        {icon && (
          <div className="w-10 h-10 rounded-2xl bg-blue-50/80 border border-blue-100/80 flex items-center justify-center text-blue-600 shrink-0 shadow-sm transition-transform duration-200 group-hover:scale-105">
            {icon}
          </div>
        )}
      </div>

      {badge && <div className="mt-4 pt-3.5 border-t border-slate-100/90">{badge}</div>}
    </Card>
  )
}
