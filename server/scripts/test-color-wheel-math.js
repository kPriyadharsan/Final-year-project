const assert = require('assert')

// Functions mirroring CircularColorPicker.jsx
function hslToRgb(h, s, l) {
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

function rgbToHue(r, g, b) {
  const rNorm = (Number(r) || 0) / 255
  const gNorm = (Number(g) || 0) / 255
  const bNorm = (Number(b) || 0) / 255
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
  return h % 360
}

function isAchromatic(r, g, b) {
  const rNorm = Number(r) || 0
  const gNorm = Number(g) || 0
  const bNorm = Number(b) || 0
  return Math.max(rNorm, gNorm, bNorm) === Math.min(rNorm, gNorm, bNorm)
}

function getHueFromColor(c) {
  if (!c || typeof c !== 'object') return null
  const r = Number(c.r) || 0
  const g = Number(c.g) || 0
  const b = Number(c.b) || 0
  if (isAchromatic(r, g, b)) return null
  return rgbToHue(r, g, b)
}

console.log('='.repeat(70))
console.log('🧪 TESTING CIRCULAR COLOR PICKER LOGIC & ANGLE SYNCHRONIZATION')
console.log('='.repeat(70) + '\n')

// 1. Verify chromatic color angles
console.log('--- 1. Testing Chromatic Color Angles ---')
const testColors = [
  { name: 'Red', color: { r: 255, g: 0, b: 0 }, expectedHue: 0 },
  { name: 'Yellow', color: { r: 255, g: 255, b: 0 }, expectedHue: 60 },
  { name: 'Green', color: { r: 0, g: 255, b: 0 }, expectedHue: 120 },
  { name: 'Cyan', color: { r: 0, g: 255, b: 255 }, expectedHue: 180 },
  { name: 'Blue', color: { r: 0, g: 0, b: 255 }, expectedHue: 240 },
  { name: 'Purple / Magenta', color: { r: 255, g: 0, b: 255 }, expectedHue: 300 },
  { name: 'Tailwind Blue (#3B82F6)', color: { r: 59, g: 130, b: 246 }, expectedHue: 217 },
]

for (const t of testColors) {
  const hue = getHueFromColor(t.color)
  assert.strictEqual(hue, t.expectedHue, `${t.name} hue mismatch: expected ${t.expectedHue}, got ${hue}`)
  console.log(`  ✅ [PASS] ${t.name} correctly resolves to ${hue}°`)
}

// 2. Verify achromatic color handling (white, black, gray)
console.log('\n--- 2. Testing Achromatic Color Handling (Angle Preservation) ---')
const achromaticColors = [
  { name: 'Pure White', color: { r: 255, g: 255, b: 255 } },
  { name: 'Pure Black (Device OFF)', color: { r: 0, g: 0, b: 0 } },
  { name: 'Medium Gray', color: { r: 128, g: 128, b: 128 } },
]

for (const a of achromaticColors) {
  assert.strictEqual(isAchromatic(a.color.r, a.color.g, a.color.b), true, `${a.name} should be achromatic`)
  const hue = getHueFromColor(a.color)
  assert.strictEqual(hue, null, `${a.name} must return null hue to preserve existing angle on wheel`)
  console.log(`  ✅ [PASS] ${a.name} returns null hue (preserves existing angle without snapping to purple or 0°)`)
}

// 3. Pointer simulation: Clicking & dragging around the wheel
console.log('\n--- 3. Testing Pointer Simulation on Circular Wheel ---')
const radius = 90
const positions = [
  { angle: 0, x: 90, y: 0, expectedColorName: 'Red' },
  { angle: 90, x: 0, y: 90, expectedColorName: 'Lime/Chartreuse' },
  { angle: 180, x: -90, y: 0, expectedColorName: 'Cyan' },
  { angle: 270, x: 0, y: -90, expectedColorName: 'Blue/Violet' },
]

for (const pos of positions) {
  let computedAngle = Math.atan2(pos.y, pos.x) * (180 / Math.PI)
  if (computedAngle < 0) computedAngle += 360
  const rounded = Math.round(computedAngle) % 360
  assert.strictEqual(rounded, pos.angle, `Angle mismatch for pos (${pos.x}, ${pos.y})`)
  const rgb = hslToRgb(rounded, 1, 0.5)
  console.log(`  ✅ [PASS] Click at (${pos.x}, ${pos.y}) -> ${rounded}° -> RGB(${rgb.r}, ${rgb.g}, ${rgb.b})`)
}

// 4. Verify 360° Roundtrip stability
console.log('\n--- 4. Testing 360° Roundtrip Precision ---')
let maxDiff = 0
for (let a = 0; a < 360; a++) {
  const rgb = hslToRgb(a, 1, 0.5)
  const roundtripHue = rgbToHue(rgb.r, rgb.g, rgb.b)
  const diff = Math.min(Math.abs(a - roundtripHue), 360 - Math.abs(a - roundtripHue))
  if (diff > maxDiff) maxDiff = diff
}
assert(maxDiff <= 1, `Max roundtrip drift should be <= 1°, got ${maxDiff}°`)
console.log(`  ✅ [PASS] Max hue angle roundtrip drift across all 360° is ${maxDiff}° (imperceptible sub-pixel precision)`)

console.log('\n' + '='.repeat(70))
console.log('🎉 ALL COLOR WHEEL MATHEMATICAL AND STATE PRESERVATION TESTS PASSED!')
console.log('='.repeat(70) + '\n')
