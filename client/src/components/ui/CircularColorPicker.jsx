import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'

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
/**
 * Checks if an RGB color is achromatic (white, gray, black where r === g === b)
 */
export function isAchromatic(r, g, b) {
  const rNorm = Number(r) || 0
  const gNorm = Number(g) || 0
  const bNorm = Number(b) || 0
  return Math.max(rNorm, gNorm, bNorm) === Math.min(rNorm, gNorm, bNorm)
}

/**
 * Extracts hue (0-359) from an RGB color object, returning null if color is achromatic or invalid
 */
export function getHueFromColor(c) {
  if (!c || typeof c !== 'object') return null
  const r = Number(c.r) || 0
  const g = Number(c.g) || 0
  const b = Number(c.b) || 0
  if (isAchromatic(r, g, b)) return null
  return rgbToHue(r, g, b)
}

/**
 * Circular Color Picker Component
 *
 * Requirements:
 * 1. Circular color selector with visually simple, smooth selection.
 * 2. User can click or drag to select any color around the spectrum.
 * 3. Selected color shown inside the center circle/swatch.
 * 4. Shows live glow when power is ON.
 * 5. Dynamic and static synchronization: stays at current color without snapping to purple.
 * 6. Fully disabled when hardware controller node is offline.
 */
export function CircularColorPicker({
  color,
  power = 'ON',
  onChange,
  onDragEnd,
  onDisabledClick,
  disabled = false,
  size = 180,
}) {
  const canvasRef = useRef(null)
  const isDraggingRef = useRef(false)
  const lastRgbRef = useRef(color || { r: 59, g: 130, b: 246 })

  const radius = size / 2
  const ringThickness = 18
  const outerRadius = radius - 6
  const innerRadius = outerRadius - ringThickness
  const centerRadius = innerRadius - 8

  // Internal angle state ensures immediate, fluid thumb tracking during drag
  // and stays firmly placed at the selected position without jumping
  const [currentAngle, setCurrentAngle] = useState(() => {
    const hue = getHueFromColor(color)
    return hue !== null ? hue : 217 // Default Blue (217°) if initially achromatic or unassigned
  })

  // Sync angle dynamically when incoming prop color changes from outside (e.g. Quick Colors, DB fetch, voice)
  // Preserves existing angle if incoming color is achromatic (e.g. White, Black, or device OFF)
  useEffect(() => {
    if (isDraggingRef.current) return
    const incomingHue = getHueFromColor(color)
    if (incomingHue !== null) {
      setCurrentAngle(incomingHue)
      lastRgbRef.current = color
    }
  }, [color?.r, color?.g, color?.b])

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
      const roundedAngle = Math.round(angle) % 360

      // Immediately update local angle so the thumb tracks 1:1 and stays in place
      setCurrentAngle(roundedAngle)

      const newRgb = hslToRgb(roundedAngle, 1, 0.5)
      lastRgbRef.current = newRgb
      if (onChange) {
        onChange(newRgb, { isDragging: !isFinal, isFinal, angle: roundedAngle })
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
        onChange(lastRgbRef.current, { isDragging: false, isFinal: true, angle: currentAngle })
      }
    }
  }

  // Thumb position on the ring
  const thumbRadius = (outerRadius + innerRadius) / 2
  const thumbAngleRad = (currentAngle * Math.PI) / 180
  const thumbX = size / 2 + thumbRadius * Math.cos(thumbAngleRad)
  const thumbY = size / 2 + thumbRadius * Math.sin(thumbAngleRad)

  // Active color resolution for center circle preview
  const displayColor = useMemo(() => {
    if (isDraggingRef.current && lastRgbRef.current) {
      return lastRgbRef.current
    }
    if (color && typeof color.r !== 'undefined' && typeof color.g !== 'undefined' && typeof color.b !== 'undefined') {
      return color
    }
    return hslToRgb(currentAngle, 1, 0.5)
  }, [color, currentAngle])

  const currentColorHex = rgbToHex(displayColor.r, displayColor.g, displayColor.b)
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
      data-testid="circular-color-picker"
      data-angle={currentAngle}
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
          backgroundColor: isPowerOn ? `rgb(${displayColor.r}, ${displayColor.g}, ${displayColor.b})` : '#334155',
          boxShadow: isPowerOn
            ? `0 0 28px rgba(${displayColor.r}, ${displayColor.g}, ${displayColor.b}, 0.55), inset 0 2px 4px rgba(255,255,255,0.4)`
            : 'inset 0 2px 4px rgba(0,0,0,0.4)',
        }}
      >
        <span
          className={`text-[10px] font-black uppercase tracking-wider drop-shadow-xs ${
            isPowerOn
              ? (displayColor.r * 0.299 + displayColor.g * 0.587 + displayColor.b * 0.114 > 150 ? 'text-slate-900' : 'text-white')
              : 'text-slate-400'
          }`}
        >
          {isPowerOn ? 'ON' : 'OFF'}
        </span>
        <span
          className={`text-[9px] font-mono font-bold mt-0.5 tracking-tight ${
            isPowerOn
              ? (displayColor.r * 0.299 + displayColor.g * 0.587 + displayColor.b * 0.114 > 150 ? 'text-slate-800' : 'text-slate-100')
              : 'text-slate-400'
          }`}
        >
          {currentColorHex}
        </span>
      </div>

      {/* Thumb / Handle Indicator on the Ring with inner hue indicator */}
      <div
        className="absolute w-5 h-5 rounded-full bg-white border-2 border-slate-900 shadow-md pointer-events-none flex items-center justify-center transition-transform duration-75"
        style={{
          left: thumbX - 10,
          top: thumbY - 10,
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
        data-testid="color-wheel-thumb"
        data-thumb-angle={currentAngle}
      >
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: `hsl(${currentAngle}, 100%, 50%)` }}
        />
      </div>
    </div>
  )
}

export default CircularColorPicker
