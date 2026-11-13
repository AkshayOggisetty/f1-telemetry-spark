import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import * as d3 from 'd3'

export function useWidth(initial = 800) {
  const ref = useRef(null)
  const [w, setW] = useState(initial)
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(260, e.contentRect.width)))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

/**
 * Multi-series line chart with a hover crosshair.
 * series: [{ id, label, color, dash, width, points: [{x, y}] }]
 */
export function LineChart({
  series,
  height = 320,
  xDomain,
  yDomain,
  invertY = false,
  xLabel,
  yLabel,
  formatX = (v) => v,
  formatY = (v) => v,
  xTicks = 10,
  yTicks = 6,
  curve = d3.curveMonotoneX,
  hoverX,
  onHoverX,
  bands = [],
  markers = [],
  yNice = true,
  margin: marginProp,
  tooltipSort = 'desc',
  animate = true,
}) {
  // Wider left margin when the y tick labels are long (e.g. lap times "1:45.000").
  const sampleY = formatY(yDomain ? yDomain[1] : series[0]?.points.find((p) => p.y != null)?.y ?? 0)
  const margin = marginProp || { top: 14, right: 18, bottom: 34, left: Math.max(54, String(sampleY).length * 7 + 26) }
  const [ref, width] = useWidth()
  const clipId = 'clip' + useId().replace(/[^a-zA-Z0-9]/g, '')
  const [localHover, setLocalHover] = useState(null)
  const hx = hoverX !== undefined ? hoverX : localHover
  const setHover = onHoverX || setLocalHover

  const iw = width - margin.left - margin.right
  const ih = height - margin.top - margin.bottom

  const all = useMemo(() => series.flatMap((s) => s.points.filter((p) => p.y != null && !Number.isNaN(p.y))), [series])
  const xd = xDomain || d3.extent(all, (p) => p.x)
  const yd = yDomain || d3.extent(all, (p) => p.y)
  const x = d3.scaleLinear().domain(xd[0] === undefined ? [0, 1] : xd).range([0, iw])
  const y = d3.scaleLinear().domain(yd[0] === undefined ? [0, 1] : yd).range(invertY ? [0, ih] : [ih, 0])
  if (yNice) y.nice()

  const line = d3
    .line()
    .defined((p) => p.y != null && !Number.isNaN(p.y))
    .x((p) => x(p.x))
    .y((p) => y(p.y))
    .curve(curve)

  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left - margin.left
    if (px < 0 || px > iw) return setHover(null)
    setHover(x.invert(px))
  }

  // Tooltip values: nearest point of each series to the hovered x.
  const tip = useMemo(() => {
    if (hx == null) return null
    const rows = []
    for (const s of series) {
      if (!s.points.length || s.hideTip) continue
      const i = d3.bisector((p) => p.x).center(s.points, hx)
      const p = s.points[i]
      if (p && p.y != null && Math.abs(x(p.x) - x(hx)) < 40) rows.push({ s, p })
    }
    rows.sort((a, b) => (tooltipSort === 'asc' ? a.p.y - b.p.y : b.p.y - a.p.y))
    return rows
  }, [hx, series, tooltipSort, x])

  const tipLeft = hx != null ? margin.left + x(hx) : 0
  const flip = tipLeft > width * 0.62

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {bands.map((b, i) => (
            <g key={i}>
              <rect x={x(b.from)} y={0} width={Math.max(1, x(b.to) - x(b.from))} height={ih} fill={b.color} opacity={b.opacity ?? 0.12} />
              {b.label && x(b.to) - x(b.from) > 30 && (
                <text x={x(b.from) + 4} y={11} style={{ fill: b.color, fontWeight: 700, fontSize: 10 }}>
                  {b.label}
                </text>
              )}
            </g>
          ))}
          <g className="grid">
            {y.ticks(yTicks).map((t) => (
              <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />
            ))}
          </g>
          <g className="axis">
            <line x1={0} x2={iw} y1={ih} y2={ih} />
            {x.ticks(xTicks).map((t) => (
              <text key={t} x={x(t)} y={ih + 18} textAnchor="middle">
                {formatX(t)}
              </text>
            ))}
            {y.ticks(yTicks).map((t) => (
              <text key={t} x={-8} y={y(t) + 4} textAnchor="end">
                {formatY(t)}
              </text>
            ))}
          </g>
          {xLabel && (
            <text className="axis-label" x={iw} y={ih + 32} textAnchor="end">
              {xLabel}
            </text>
          )}
          {yLabel && (
            <text className="axis-label" transform={`translate(${-margin.left + 12},0) rotate(-90)`} textAnchor="end">
              {yLabel}
            </text>
          )}
          {markers.map((m, i) => (
            <g key={i}>
              <line x1={x(m.x)} x2={x(m.x)} y1={0} y2={ih} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 3" />
              <text x={x(m.x)} y={ih - 4} textAnchor="middle" style={{ fontSize: 9.5, fill: 'var(--dim)' }}>
                {m.label}
              </text>
            </g>
          ))}
          <defs>
            <clipPath id={clipId}>
              <rect x={-4} y={-4} width={iw + 8} height={ih + 8} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {series.map((s) => (
              <motion.path
                key={s.id}
                d={line(s.points) || ''}
                fill="none"
                stroke={s.color}
                strokeWidth={s.width || 1.8}
                strokeDasharray={s.dash ? '5 4' : undefined}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={s.opacity ?? 1}
                initial={animate ? { pathLength: 0, opacity: 0 } : false}
                animate={{ pathLength: 1, opacity: s.opacity ?? 1 }}
                transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
              />
            ))}
          </g>
          {hx != null && (
            <g pointerEvents="none">
              <line x1={x(hx)} x2={x(hx)} y1={0} y2={ih} stroke="rgba(255,255,255,0.35)" />
              {tip?.map(({ s, p }) => (
                <circle key={s.id} cx={x(p.x)} cy={y(p.y)} r={3.5} fill={s.color} stroke="#000" strokeWidth={1} />
              ))}
            </g>
          )}
        </g>
      </svg>
      {tip && tip.length > 0 && (
        <div
          className="tooltip"
          style={{
            top: margin.top + 6,
            left: flip ? undefined : tipLeft + 14,
            right: flip ? width - tipLeft + 14 : undefined,
          }}
        >
          <div className="head">
            {xLabel} {formatX(tip[0].p.x)}
          </div>
          {tip.slice(0, 12).map(({ s, p }) => (
            <div className="row" key={s.id}>
              <span>
                <span className="legend-line" style={{ background: s.color }} />
                {s.label || s.id}
              </span>
              <b>{formatY(p.y)}</b>
            </div>
          ))}
          {tip.length > 12 && <div className="dim">+{tip.length - 12} more</div>}
        </div>
      )}
    </div>
  )
}

/** Simple horizontal bar list. */
export function BarList({ rows, format = (v) => v, max }) {
  const m = max ?? Math.max(...rows.map((r) => Math.abs(r.value)), 1e-9)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '120px 1fr 70px', gap: 10, alignItems: 'center', fontSize: 13 }}>
          <span style={{ fontWeight: 700 }}>{r.label}</span>
          <div style={{ height: 10, background: 'var(--bg-2)', borderRadius: 5, overflow: 'hidden' }}>
            <motion.div
              style={{ height: '100%', background: r.color || 'var(--red)', borderRadius: 5 }}
              initial={{ width: 0 }}
              whileInView={{ width: `${(Math.abs(r.value) / m) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: i * 0.04, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <span className="mono" style={{ textAlign: 'right' }}>
            {format(r.value)}
          </span>
        </div>
      ))}
    </div>
  )
}
