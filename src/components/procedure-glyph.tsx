import type { Procedure } from '@/lib/procedures'

type Ellipse = [cx: number, cy: number, rx: number, ry: number]

const ZONES: Record<Procedure['zone'], Ellipse[]> = {
  nose: [[100, 126, 14, 24]],
  lips: [[100, 166, 25, 10]],
  chin: [[100, 199, 22, 13]],
  jaw: [
    [60, 172, 13, 30],
    [140, 172, 13, 30],
  ],
  cheeks: [
    [67, 134, 16, 14],
    [133, 134, 16, 14],
  ],
  face: [[100, 158, 52, 56]],
  eyes: [
    [74, 105, 18, 10],
    [126, 105, 18, 10],
  ],
  brow: [
    [74, 88, 21, 8],
    [126, 88, 21, 8],
  ],
  forehead: [[100, 60, 42, 18]],
  chest: [
    [78, 94, 22, 19],
    [122, 94, 22, 19],
  ],
  waist: [
    [50, 142, 12, 28],
    [150, 142, 12, 28],
  ],
  abdomen: [[100, 164, 34, 30]],
}

function Face() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round">
      <path d="M100 22C60 22 42 56 42 100c0 50 20 100 58 116 38-16 58-66 58-116 0-44-18-78-58-78Z" />
      <path d="M56 90c10-7 26-7 36-1M108 89c10-6 26-6 36 1" opacity=".55" />
      <path d="M60 106c8-7 20-7 28 0-8 5-20 5-28 0ZM112 106c8-7 20-7 28 0-8 5-20 5-28 0Z" opacity=".55" />
      <path d="M100 104v32c-5 4-9 6-11 10 6 3 16 3 22 0-2-4-6-6-11-10" opacity=".55" />
      <path d="M78 166c8-5 16-6 22-3 6-3 14-2 22 3-8 8-36 8-44 0Z" opacity=".55" />
    </g>
  )
}

function Torso() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">
      <path d="M84 8v22c-22 6-48 12-54 40l8 52c8 14 12 30 8 54l-6 56M116 8v22c22 6 48 12 54 40l-8 52c-8 14-12 30-8 54l6 56" />
      <path d="M58 98c8 16 30 18 42 2 12 16 34 14 42-2" opacity=".55" />
      <path d="M100 150v4" opacity=".55" />
      <path d="M62 206c24 10 52 10 76 0" opacity=".55" />
    </g>
  )
}

/** A line drawing of the area a procedure treats. It illustrates the region, never a result. */
export function ProcedureGlyph({ procedure, className = '' }: { procedure: Procedure; className?: string }) {
  return (
    <svg viewBox="0 0 200 240" role="img" aria-label={`${procedure.region} area`} className={`text-white/55 ${className}`}>
      {procedure.area === 'face' ? <Face /> : <Torso />}
      {ZONES[procedure.zone].map(([cx, cy, rx, ry]) => (
        <g key={`${cx}-${cy}`}>
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity=".14" />
          <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="none" stroke="#fff" strokeWidth="1.2" strokeDasharray="3 4" />
        </g>
      ))}
    </svg>
  )
}
