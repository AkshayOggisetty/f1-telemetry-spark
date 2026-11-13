import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import * as d3 from 'd3'
import { Card, DriverChips, DriverName, Page, PageHead, Ready, Reveal, Seg, SessionPicker, useMeta, useSession, useToggleSet } from '../components/ui'
import { useWidth } from '../components/charts'
import { sessionFile, useData } from '../lib/data'
import { compound, lapTime } from '../lib/format'

export default function LapTimes() {
  const [meta, e1] = useMeta()
  const [slug] = useSession()
  const [data, e2] = useData(sessionFile(slug, 'laps'), sessionFile(slug, 'results'))
  const session = meta?.sessions.find((s) => s.slug === slug)
  return (
    <Page>
      <PageHead kicker="Every lap" title="Lap times" right={meta && <SessionPicker sessions={meta.sessions} />}>
        All {session ? session.laps : ''} laps of {session ? session.name : 'the session'}. Slow laps (in/out laps, Safety Car, cool-down) are hidden by
        the 107% filter.
      </PageHead>
      <Ready error={e1 || e2} ready={meta && data && session}>
        {() => <LapView key={slug} meta={meta} laps={data[0]} results={data[1]} />}
      </Ready>
    </Page>
  )
}

function LapView({ meta, laps, results }) {
  const order = results.classification.map((r) => r.code).filter((c) => laps[c])
  const drivers = order.map((c) => meta.byCode[c])
  const [active, toggle, only, all] = useToggleSet(order.slice(0, 6))
  const [colorBy, setColorBy] = useState('compound')
  const [filter, setFilter] = useState('107')

  const best = Math.min(...Object.values(laps).flatMap((L) => L.filter((l) => l.time && !l.deleted).map((l) => l.time)))
  const limit = filter === 'all' ? Infinity : best * (+filter / 100)

  const points = useMemo(
    () =>
      order
        .filter((c) => active.has(c))
        .flatMap((c) => laps[c].filter((l) => l.time && l.time <= limit).map((l) => ({ ...l, code: c }))),
    [order, active, laps, limit],
  )

  const sectors = useMemo(() => {
    const rows = order.map((c) => {
      const L = laps[c].filter((l) => !l.deleted)
      const min = (k) => d3.min(L, (l) => l[k] || undefined)
      const s1 = min('s1')
      const s2 = min('s2')
      const s3 = min('s3')
      return { code: c, s1, s2, s3, ideal: s1 && s2 && s3 ? s1 + s2 + s3 : null, best: min('time'), trap: d3.max(L, (l) => l.trap || undefined) }
    })
    const top = {}
    for (const k of ['s1', 's2', 's3', 'ideal', 'best', 'trap']) top[k] = k === 'trap' ? d3.max(rows, (r) => r[k]) : d3.min(rows, (r) => r[k])
    return { rows: rows.sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9)), top }
  }, [order, laps])

  const spread = useMemo(
    () =>
      order
        .map((c) => {
          const v = laps[c].filter((l) => l.time && l.time <= best * 1.07 && !l.deleted).map((l) => l.time).sort(d3.ascending)
          return { code: c, v, med: d3.median(v), q1: d3.quantile(v, 0.25), q3: d3.quantile(v, 0.75) }
        })
        .filter((r) => r.v.length >= 3)
        .sort((a, b) => a.med - b.med),
    [order, laps, best],
  )

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Reveal>
        <Card
          title="Lap time scatter"
          right={
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Seg value={colorBy} onChange={setColorBy} options={[{ value: 'compound', label: 'Tyre' }, { value: 'driver', label: 'Driver' }]} />
              <Seg value={filter} onChange={setFilter} options={[{ value: '103', label: '103%' }, { value: '107', label: '107%' }, { value: 'all', label: 'All' }]} />
            </div>
          }
        >
          <DriverChips drivers={drivers} active={active} onToggle={toggle} onOnly={only} />
          <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
            <button className="btn" onClick={() => all(order.slice(0, 6))}>Top 6</button>
            <button className="btn" onClick={() => all(order)}>All</button>
          </div>
          <Scatter points={points} meta={meta} colorBy={colorBy} />
        </Card>
      </Reveal>

      <div className="grid g-2">
        <Reveal>
          <Card title="Pace distribution" note="Laps within 107% of the session best. The bar spans the middle 50% of each driver's laps; the white tick is the median.">
            <Spread rows={spread} meta={meta} />
          </Card>
        </Reveal>
        <Reveal delay={0.05}>
          <Card title="Best sectors" note="Purple = fastest in the session. Ideal lap = sum of a driver's best three sectors.">
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Driver</th>
                    <th className="num">S1</th>
                    <th className="num">S2</th>
                    <th className="num">S3</th>
                    <th className="num">Ideal</th>
                    <th className="num">Best</th>
                    <th className="num">Trap</th>
                  </tr>
                </thead>
                <tbody>
                  {sectors.rows.map((r) => (
                    <tr key={r.code}>
                      <td><DriverName d={meta.byCode[r.code]} short /></td>
                      {['s1', 's2', 's3', 'ideal', 'best'].map((k) => (
                        <td key={k} className="num" style={{ color: r[k] === sectors.top[k] ? 'var(--purple)' : undefined }}>
                          {k === 'ideal' || k === 'best' ? lapTime(r[k]) : r[k]?.toFixed(3) ?? '—'}
                        </td>
                      ))}
                      <td className="num" style={{ color: r.trap === sectors.top.trap ? 'var(--purple)' : undefined }}>{r.trap ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Reveal>
      </div>
    </div>
  )
}

function Scatter({ points, meta, colorBy }) {
  const [ref, width] = useWidth()
  const [tip, setTip] = useState(null)
  const m = { top: 12, right: 16, bottom: 34, left: 60 }
  const h = 380
  const iw = width - m.left - m.right
  const ih = h - m.top - m.bottom
  const x = d3.scaleLinear().domain([0.5, (d3.max(points, (p) => p.lap) || 1) + 0.5]).range([0, iw])
  const y = d3.scaleLinear().domain(d3.extent(points, (p) => p.time).map((v, i) => (v ?? 0) + (i ? 0.4 : -0.4))).nice().range([ih, 0])
  const color = (p) => (colorBy === 'compound' ? compound(p.compound).color : meta.byCode[p.code].color)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <svg className="chart" width={width} height={h}>
        <g transform={`translate(${m.left},${m.top})`}>
          <g className="grid">{y.ticks(6).map((t) => <line key={t} x1={0} x2={iw} y1={y(t)} y2={y(t)} />)}</g>
          <g className="axis">
            <line x1={0} x2={iw} y1={ih} y2={ih} />
            {x.ticks(12).filter(Number.isInteger).map((t) => <text key={t} x={x(t)} y={ih + 18} textAnchor="middle">{t}</text>)}
            {y.ticks(6).map((t) => <text key={t} x={-8} y={y(t) + 4} textAnchor="end">{lapTime(t)}</text>)}
          </g>
          <text className="axis-label" x={iw} y={ih + 32} textAnchor="end">Lap</text>
          {points.map((p, i) => (
            <motion.circle
              key={`${p.code}-${p.lap}`}
              cx={x(p.lap)}
              cy={y(p.time)}
              r={tip && tip.code === p.code && tip.lap === p.lap ? 7 : 4.5}
              fill={color(p)}
              stroke={colorBy === 'compound' ? meta.byCode[p.code].color : '#000'}
              strokeWidth={1.5}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 0.9, scale: 1 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.002, 0.5) }}
              onMouseEnter={() => setTip(p)}
              onMouseLeave={() => setTip(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </g>
      </svg>
      {tip && (
        <div className="tooltip" style={{ left: Math.min(width - 180, m.left + x(tip.lap) + 12), top: m.top + y(tip.time) - 10 }}>
          <div className="head">{meta.byCode[tip.code].last} · Lap {tip.lap}</div>
          <div className="row"><span>Time</span><b>{lapTime(tip.time)}</b></div>
          <div className="row"><span>Tyre</span><b>{tip.compound} ({tip.tyre})</b></div>
          {tip.pos && <div className="row"><span>Position</span><b>P{tip.pos}</b></div>}
          {tip.trap && <div className="row"><span>Speed trap</span><b>{tip.trap}</b></div>}
        </div>
      )}
    </div>
  )
}

function Spread({ rows, meta }) {
  const [ref, width] = useWidth()
  const left = 52
  const row = 22
  const lo = d3.min(rows, (r) => r.v[0])
  const hi = d3.max(rows, (r) => r.q3 + (r.q3 - r.q1) * 2)
  const x = d3.scaleLinear().domain([lo - 0.2, Math.min(hi, d3.max(rows, (r) => r.v[r.v.length - 1]))]).nice().range([left, width - 10])
  const h = rows.length * row + 26
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h}>
        {x.ticks(6).map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={0} y2={h - 22} stroke="rgba(255,255,255,0.05)" />
            <text x={x(t)} y={h - 6} textAnchor="middle">{lapTime(t)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const d = meta.byCode[r.code]
          return (
            <g key={r.code} transform={`translate(0,${i * row})`}>
              <text x={0} y={15} style={{ fill: '#fff', fontWeight: 700 }}>{r.code}</text>
              {r.v.map((v, k) => (
                <circle key={k} cx={x(v)} cy={11} r={2.2} fill={d.color} opacity={0.5} />
              ))}
              <motion.rect
                y={5}
                height={12}
                rx={3}
                fill={d.color}
                opacity={0.55}
                initial={{ x: x(r.med), width: 0 }}
                whileInView={{ x: x(r.q1), width: Math.max(2, x(r.q3) - x(r.q1)) }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: i * 0.03 }}
              />
              <line x1={x(r.med)} x2={x(r.med)} y1={3} y2={19} stroke="#fff" strokeWidth={2} />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
