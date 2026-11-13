import { motion } from 'framer-motion'

/** Baku circuit outline with corner numbers; children draw on top in track metres. */
export function TrackMap({ circuit, children, showCorners = true, color = '#3a3a48', width = 14, pad = 70, style, draw = false, className }) {
  const [x0, y0, x1, y1] = circuit.bounds
  const vb = `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`
  const d = 'M' + circuit.outline.map((p) => p.join(',')).join('L') + 'Z'
  return (
    <svg viewBox={vb} className={className} style={{ width: '100%', height: '100%', display: 'block', ...style }}>
      <path d={d} fill="none" stroke="#000" strokeWidth={width + 8} strokeLinejoin="round" opacity={0.6} />
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={draw ? { pathLength: 0 } : false}
        animate={{ pathLength: 1, stroke: color }}
        transition={{ pathLength: { duration: 2.2, ease: 'easeInOut' }, stroke: { duration: 0.6 } }}
      />
      <StartLine circuit={circuit} />
      {showCorners &&
        circuit.corners.map((c) => (
          <g key={c.n}>
            <line x1={c.x} y1={c.y} x2={c.lx} y2={c.ly} stroke="#55556a" strokeWidth={2} />
            <circle cx={c.lx} cy={c.ly} r={26} fill="#15151e" stroke="#55556a" strokeWidth={2} />
            <text x={c.lx} y={c.ly + 10} textAnchor="middle" fill="#c9c9d4" fontSize={28} fontWeight={700} fontFamily="Titillium Web">
              {c.n}
            </text>
          </g>
        ))}
      {children}
    </svg>
  )
}

function StartLine({ circuit }) {
  const [a, b] = circuit.outline
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = (-dy / len) * 22
  const ny = (dx / len) * 22
  return (
    <g>
      <line x1={a[0] - nx} y1={a[1] - ny} x2={a[0] + nx} y2={a[1] + ny} stroke="#fff" strokeWidth={7} />
      <line x1={a[0] - nx} y1={a[1] - ny} x2={a[0] + nx} y2={a[1] + ny} stroke="#000" strokeWidth={7} strokeDasharray="7 7" />
    </g>
  )
}

/** Colour a polyline by segments (e.g. speed or track dominance). */
export function ColoredPath({ xs, ys, colors, width = 16 }) {
  const segs = []
  for (let i = 0; i < xs.length - 1; i++) {
    segs.push(
      <line key={i} x1={xs[i]} y1={ys[i]} x2={xs[i + 1]} y2={ys[i + 1]} stroke={colors[i]} strokeWidth={width} strokeLinecap="round" />,
    )
  }
  return <g>{segs}</g>
}
