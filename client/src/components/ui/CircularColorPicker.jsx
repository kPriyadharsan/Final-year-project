import React, { useRef, useEffect, useCallback, useMemo } from 'react'

/**
 * Converts Hue (0-360), Saturation (0-1), Lightness (0-1) to RGB (0-255)
 */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0

  if (0 <= h && h < 60) {
    r = c; g = x; b = 0
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c
  } else if (300 <= h && h <= 360) {
    r = c; g = 0; b = x
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  }
}

/**
 * Converts RGB (0-255) to Hue (0-360)
 */
export function rgbToHue(r, g, b) {
  const rNorm = r / 255
  const gNorm = g / 255
  const bNorm = b / 255
  const max = Math.max(rNorm, gNorm, bNorm)
  const min = Math.min(rNorm, gNorm, bNorm)
  const d = max - min

  if (d === 0) return 0

  let h = 0
  if (max === rNorm) {
    h = ((gNorm - bNorm) / d) % 6
  } else if (max === gNorm) {
    h = (bNorm - rNorm) / d + 2
  } else {
    h = (rNorm - gNorm) / d + 4
  }

  h = Math.round(h * 60)
  if (h < 0) h += 360
  return h
}

/**
 * Converts RGB to HEX string (e.g. #FF00FF)
 */
export function rgbToHex(r, g, b) {
  const toHex = (n) => {
    const hex = Math.max(0, Math.min(255, Math.round(n || 0))).toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase()
}

/**
 * Circular Color Picker Component
 *
 * Requirements:
 * 1. Circular color selector with visually simple, smooth selection.
 * 2. User can click or drag to select any color around the spectrum.
 * 3. Selected color shown inside the center circle/swatch.
 * 4. Shows live glow when power is ON.
 * 5. Fully disabled when hardware controller node is offline.
 */
export function CircularColorPicker({
  color = { r: 255, g: 0, b: 255 },
  power = 'ON',
  onChange,
  onDragEnd,
  onDisabledClick,
  disabled = false,
  size = 180,
}) {
  const canvasRef = useRef(null)
  const isDraggingRef = useRef(false)
  const lastRgbRef = useRef(color)

  const radius = size / 2
  const ringThickness = 18
  const outerRadius = radius - 6
  const innerRadius = outerRadius - ringThickness
  const centerRadius = innerRadius - 8

  // Keep track of latest color
  useEffect(() => {
    if (!isDraggingRef.current) {
      lastRgbRef.current = color
    }
  }, [color])

  // Calculate current angle from RGB color
  const currentAngle = useMemo(() => {
    return rgbToHue(color.r, color.g, color.b)
  }, [color.r, color.g, color.b])

  // Draw the smooth conical color wheel on the canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = size * dpr
    canvas.height = size * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, size, size)

    const centerX = size / 2
    const centerY = size / 2

    // Draw smooth rainbow conic ring
    const step = 1 // 1 degree per segment for silky smooth gradient
    for (let angle = 0; angle < 360; angle += step) {
      const startAngle = ((angle - 1) * Math.PI) / 180
      const endAngle = ((angle + step + 1) * Math.PI) / 180

      ctx.beginPath()
      ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle)
      ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true)
      ctx.closePath()

      ctx.fillStyle = `hsl(${angle}, 100%, 50%)`
      ctx.fill()
    }

    // Outer subtle border
    ctx.beginPath()
    ctx.arc(centerX, centerY, outerRadius + 1, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)'
    ctx.lineWidth = 1
    ctx.stroke()

    // Inner subtle border
    ctx.beginPath()
    ctx.arc(centerX, centerY, innerRadius - 1, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(226, 232, 240, 0.8)'
    ctx.lineWidth = 1
    ctx.stroke()
  }, [size, outerRadius, innerRadius])

  // Handle color calculation from pointer coordinates
  const handlePointerEvent = useCallback(
    (e, isFinal = false) => {
      if (disabled) {
        if (onDisabledClick) onDisabledClick()
        return
      }
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left - size / 2
      const y = e.clientY - rect.top - size / 2

      let angle = Math.atan2(y, x) * (180 / Math.PI)
      if (angle < 0) angle += 360

      const newRgb = hslToRgb(angle, 1, 0.5)
      lastRgbRef.current = newRgb
      if (onChange) {
        onChange(newRgb, { isDragging: !isFinal, isFinal })
      }
      return newRgb
    },
    [disabled, size, onChange, onDisabledClick]
  )

  const handlePointerDown = (e) => {
    if (disabled) {
      if (onDisabledClick) onDisabledClick()
      return
    }
    isDraggingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Ignored
    }
    handlePointerEvent(e, false)
  }

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || disabled) return
    handlePointerEvent(e, false)
  }

  const handlePointerUp = (e) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        // Ignored
      }
      if (onDragEnd && lastRgbRef.current) {
        onDragEnd(lastRgbRef.current)
      } else if (onChange && lastRgbRef.current) {
        onChange(lastRgbRef.current, { isDragging: false, isFinal: true })
      }
    }
  }

  // Thumb position on the ring
  const thumbRadius = (outerRadius + innerRadius) / 2
  const thumbAngleRad = (currentAngle * Math.PI) / 180
  const thumbX = size / 2 + thumbRadius * Math.cos(thumbAngleRad)
  const thumbY = size / 2 + thumbRadius * Math.sin(thumbAngleRad)

  const currentColorHex = rgbToHex(color.r, color.g, color.b)
  const isPowerOn = power === 'ON'

  return (
    <div
      className={`relative select-none flex items-center justify-center transition-opacity duration-200 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
      style={{ width: size, height: size }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      role="slider"
      aria-label="Color Wheel Selector"
      aria-valuetext={currentColorHex}
    >
      {/* Conic Rainbow Spectrum Canvas */}
      <canvas
        ref={canvasRef}
        style={{ width: size, height: size }}
        className="block touch-none"
      />

      {/* Center Swatch Circle Preview */}
      <div
        className="absolute rounded-full flex flex-col items-center justify-center transition-all duration-300 border-2 border-white/90 shadow-md"
        style={{
          width: centerRadius * 2,
          height: centerRadius * 2,
          backgroundColor: isPowerOn ? `rgb(${color.r}, ${color.g}, ${color.b})` : '#334155',
          boxShadow: isPowerOn
            ? `0 0 28px rgba(${color.r}, ${color.g}, ${color.b}, 0.55), inset 0 2px 4px rgba(255,255,255,0.4)`
            : 'inset 0 2px 4px rgba(0,0,0,0.4)',
        }}
      >
        <span
          className={`text-[10px] font-black uppercase tracking-wider drop-shadow-xs ${
            isPowerOn
              ? (color.r * 0.299 + color.g * 0.587 + color.b * 0.114 > 150 ? 'text-slate-900' : 'text-white')
              : 'text-slate-400'
          }`}
        >
          {isPowerOn ? 'ON' : 'OFF'}
        </span>
        <span
          className={`text-[9px] font-mono font-bold mt-0.5 tracking-tight ${
            isPowerOn
              ? (color.r * 0.299 + color.g * 0.587 + color.b * 0.114 > 150 ? 'text-slate-800' : 'text-slate-100')
              : 'text-slate-500'
          }`}
        >
          {currentColorHex}
        </span>
      </div>

      {/* Thumb / Handle Indicator on the Ring */}
      <div
        className="absolute w-5 h-5 rounded-full bg-white border-2 border-slate-900 shadow-md pointer-events-none transition-transform duration-75"
        style={{
          left: thumbX - 10,
          top: thumbY - 10,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  )
}

export default CircularColorPicker
