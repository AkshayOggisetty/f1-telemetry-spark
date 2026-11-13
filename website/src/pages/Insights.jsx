import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import * as d3 from 'd3'
import { Card, DriverName, Page, PageHead, Ready, Reveal, Stat, Tyre, useMeta } from '../components/ui'
import { BarList, LineChart, useWidth } from '../components/charts'
import { useData } from '../lib/data'
import { compound, lapTime } from '../lib/format'

const CLUSTER_COLORS = ['#e10600', '#2b7cff', '#00d26a', '#ffd12e', '#b138dd', '#ff8700']

export default function Insights() {
  const [meta, e1] = useMeta()
  const [data, e2] = useData('analytics.json')
  return (
    <Page>
      <PageHead kicker="Spark MLlib on YARN" title="Machine learning insights">
        Results of the Spark jobs in <code className="mono">code/</code>, read from HDFS <code className="mono">/bda/f1-telemetry/analysis_v2</code>: linear
        regression, K-Means, distance-based anomaly detection, a DataFrame graph and a Random Forest.
      </PageHead>
      <Ready error={e1 || e2} ready={meta && data}>
        {() => <InsightsView meta={meta} a={data[0]} />}
      </Ready>
    </Page>
  )
}

function InsightsView({ meta, a }) {
  const m = a.nextLap.metrics[0]
  return (
    <div className="grid" style={{ gap: 18 }}>
      <div className="grid g-4">
        <Reveal><Stat label="Lap feature rows" value={a.lapFeatures.rows.toLocaleString()} sub={`${a.lapFeatures.pushLaps} clean push laps`} /></Reveal>
        <Reveal delay={0.04}><Stat label="Next-lap MAE" value={`${m.mae.toFixed(3)} s`} sub={`RMSE ${m.rmse.toFixed(3)} s · R² ${m.r2.toFixed(3)}`} color="var(--green)" /></Reveal>
        <Reveal delay={0.08}><Stat label="Driver clusters" value={new Set(a.driverClusters.map((d) => d.cluster)).size} sub="best K by silhouette score" /></Reveal>
        <Reveal delay={0.12}><Stat label="Chase edges" value={a.chase.edges.length} sub="driver-behind-driver pairs within 50 m" /></Reveal>
      </div>

      <div className="grid g-2">
        <Reveal><TyreDeg rows={a.tyreDegradation} /></Reveal>
        <Reveal delay={0.05}><NextLap a={a} meta={meta} /></Reveal>
      </div>

      <Reveal><Clusters rows={a.driverClusters} meta={meta} /></Reveal>
      <Reveal><Chase chase={a.chase} meta={meta} /></Reveal>
      <Reveal><Anomalies rows={a.anomalies} meta={meta} /></Reveal>
    </div>
  )
}

function TyreDeg({ rows }) {
  return (
    <Card
      title="Tyre degradation · linear regression"
      note="Seconds added per lap of tyre age, from a separate regression per compound (lap_time ~ tyre_life + lap) on clean push laps across all sessions."
      style={{ height: '100%' }}
    >
      <BarList
        rows={rows.map((r) => ({ label: r.compound, value: r.degradation_sec_per_tyre_life, color: compound(r.compound).color }))}
        format={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(3)} s`}
      />
      <table className="table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Compound</th>
            <th className="num">Laps</th>
            <th className="num">Lap effect</th>
            <th className="num">RMSE</th>
            <th className="num">R²</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.compound}>
              <td><Tyre c={r.compound} size={18} /> {r.compound}</td>
              <td className="num">{r.sample_count}</td>
              <td className="num">{r.lap_effect_sec_per_lap.toFixed(3)} s</td>
              <td className="num">{r.rmse.toFixed(2)}</td>
              <td className="num">{r.r2.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>
        Low R² values show that tyre age alone explains little of the lap-time variance: fuel burn-off (the negative lap effect), track evolution and
        session differences dominate. Softs degrade fastest, as expected.
      </p>
    </Card>
  )
}

function NextLap({ a, meta }) {
  const preds = a.nextLap.predictions
  const codes = [...new Set(preds.map((p) => p.driver))]
  const [drv, setDrv] = useState(codes[0])
  const lo = d3.min(preds, (p) => Math.min(p.next_lap_time, p.prediction)) - 0.3
  const hi = d3.max(preds, (p) => Math.max(p.next_lap_time, p.prediction)) + 0.3
  const mine = preds.filter((p) => p.driver === drv)
  return (
    <Card
      title="Next-lap prediction · random forest"
      note="80 trees, depth 8. Features: previous lap, tyre life, stint, track temperature, lap number, compound. The held-out 20% (the last rows by session, driver, lap) are all race laps."
      style={{ height: '100%' }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <span className="muted upper" style={{ fontSize: 12, fontWeight: 700 }}>Driver</span>
        <select value={drv} onChange={(e) => setDrv(e.target.value)}>
          {codes.map((c) => (
            <option key={c} value={c}>{c} · {meta.byCode[c]?.last}</option>
          ))}
        </select>
      </div>
      <LineChart
        series={[
          { id: 'actual', label: 'Actual', color: meta.byCode[drv]?.color || '#fff', points: mine.map((p) => ({ x: p.lap + 1, y: p.next_lap_time })) },
          { id: 'pred', label: 'Predicted', color: '#ffffff', dash: true, points: mine.map((p) => ({ x: p.lap + 1, y: p.prediction })) },
        ]}
        height={220}
        xLabel="Lap"
        formatY={(v) => lapTime(v)}
        yLabel="Lap time"
      />
      <div className="muted" style={{ fontSize: 12, margin: '10px 0 4px' }}>Predicted vs actual, all {preds.length} test laps</div>
      <PredScatter preds={preds} lo={lo} hi={hi} meta={meta} />
    </Card>
  )
}

function PredScatter({ preds, lo, hi, meta }) {
  const [ref, width] = useWidth()
  const s = Math.min(width, 260)
  const x = d3.scaleLinear().domain([lo, hi]).range([30, s - 8])
  const y = d3.scaleLinear().domain([lo, hi]).range([s - 22, 8])
  return (
    <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }}>
      <svg className="chart" width={s} height={s}>
        <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="rgba(255,255,255,0.3)" strokeDasharray="4 4" />
        {preds.map((p, i) => (
          <circle key={i} cx={x(p.next_lap_time)} cy={y(p.prediction)} r={3} fill={meta.byCode[p.driver]?.color} opacity={0.8} />
        ))}
        <text x={s / 2} y={s - 4} textAnchor="middle" className="axis-label">Actual</text>
        <text transform={`translate(10,${s / 2}) rotate(-90)`} textAnchor="middle" className="axis-label">Predicted</text>
      </svg>
    </div>
  )
}

function Clusters({ rows, meta }) {
  const [ref, width] = useWidth()
  const [hov, setHov] = useState(null)
  const h = 360
  const mg = { l: 56, r: 20, t: 14, b: 36 }
  const x = d3.scaleLinear().domain(d3.extent(rows, (r) => r.avg_speed)).nice().range([mg.l, width - mg.r])
  const y = d3.scaleLinear().domain(d3.extent(rows, (r) => r.avg_throttle)).nice().range([h - mg.b, mg.t])
  const clusters = [...new Set(rows.map((r) => r.cluster))].sort()
  const feats = ['avg_speed', 'max_speed', 'avg_rpm', 'avg_throttle', 'avg_acceleration', 'braking_percent', 'drs_percent']
  const centroids = clusters.map((c) => {
    const rs = rows.filter((r) => r.cluster === c)
    return { c, n: rs.length, ...Object.fromEntries(feats.map((f) => [f, d3.mean(rs, (r) => r[f])])) }
  })
  return (
    <Card
      title="Driver style clusters · K-Means"
      note="Each driver's average telemetry across all sessions, standardised, then clustered with K-Means (K chosen by silhouette score from 2–5). Plotted on average speed vs average throttle."
    >
      <div className="grid g-2" style={{ alignItems: 'start' }}>
        <div ref={ref}>
          <svg className="chart" width={width} height={h}>
            {x.ticks(6).map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={mg.t} y2={h - mg.b} stroke="rgba(255,255,255,0.05)" />
                <text x={x(t)} y={h - mg.b + 16} textAnchor="middle">{t}</text>
              </g>
            ))}
            {y.ticks(6).map((t) => (
              <g key={t}>
                <line x1={mg.l} x2={width - mg.r} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.05)" />
                <text x={mg.l - 8} y={y(t) + 4} textAnchor="end">{t}</text>
              </g>
            ))}
            <text className="axis-label" x={width - mg.r} y={h - 4} textAnchor="end">Avg speed (km/h)</text>
            <text className="axis-label" transform={`translate(12,${mg.t}) rotate(-90)`} textAnchor="end">Avg throttle (%)</text>
            {rows.map((r, i) => {
              const d = meta.byCode[r.driver]
              const on = hov == null || hov === r.cluster
              return (
                <motion.g
                  key={r.driver}
                  initial={{ opacity: 0, scale: 0.4 }}
                  whileInView={{ opacity: on ? 1 : 0.2, scale: 1 }}
                  animate={{ opacity: on ? 1 : 0.2 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.03 }}
                  style={{ transformOrigin: `${x(r.avg_speed)}px ${y(r.avg_throttle)}px` }}
                >
                  <circle cx={x(r.avg_speed)} cy={y(r.avg_throttle)} r={9} fill={CLUSTER_COLORS[r.cluster % 6]} stroke={d?.color} strokeWidth={3} />
                  <text x={x(r.avg_speed) + 13} y={y(r.avg_throttle) + 4} style={{ fill: '#fff', fontWeight: 700 }}>{r.driver}</text>
                </motion.g>
              )
            })}
          </svg>
        </div>
        <div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th className="num">Drivers</th>
                  <th className="num">Avg km/h</th>
                  <th className="num">Throttle</th>
                  <th className="num">Braking</th>
                  <th className="num">DRS</th>
                </tr>
              </thead>
              <tbody>
                {centroids.map((c) => (
                  <tr key={c.c} onMouseEnter={() => setHov(c.c)} onMouseLeave={() => setHov(null)} style={{ cursor: 'default' }}>
                    <td><span className="team-bar" style={{ background: CLUSTER_COLORS[c.c % 6] }} />Cluster {c.c}</td>
                    <td className="num">{c.n}</td>
                    <td className="num">{c.avg_speed.toFixed(1)}</td>
                    <td className="num">{c.avg_throttle.toFixed(1)}%</td>
                    <td className="num">{(c.braking_percent * 100).toFixed(1)}%</td>
                    <td className="num">{(c.drs_percent * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
            {centroids.map((c) => (
              <div key={c.c} style={{ fontSize: 13 }} onMouseEnter={() => setHov(c.c)} onMouseLeave={() => setHov(null)}>
                <b style={{ color: CLUSTER_COLORS[c.c % 6] }}>Cluster {c.c}:</b>{' '}
                <span className="muted">{rows.filter((r) => r.cluster === c.c).map((r) => r.driver).join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

function Chase({ chase, meta }) {
  const [ref, width] = useWidth()
  const [hov, setHov] = useState(null)
  const [topN, setTopN] = useState(45)
  const size = Math.min(width, 560)
  const r = size / 2 - 56
  const order = meta.drivers.map((d) => d.code)
  const pos = Object.fromEntries(order.map((c, i) => {
    const a = (i / order.length) * Math.PI * 2 - Math.PI / 2
    return [c, { x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a), a }]
  }))
  const edges = chase.edges.slice(0, topN)
  const w = d3.scaleLinear().domain(d3.extent(edges, (e) => e.duration_seconds)).range([1, 9])
  const stats = useMemo(() => {
    const out = Object.fromEntries(order.map((c) => [c, { chasing: 0, chased: 0 }]))
    for (const e of chase.edges) {
      if (out[e.src]) out[e.src].chasing += e.duration_seconds
      if (out[e.dst]) out[e.dst].chased += e.duration_seconds
    }
    return out
  }, [chase, order])

  return (
    <Card
      title="Chase graph · who spent time right behind whom"
      note="Built with Spark DataFrames from the DriverAhead / DistanceToDriverAhead telemetry. An edge A → B means A was less than 50 m behind B; its width is the total time spent there across all sessions. Hover a driver."
      right={
        <select value={topN} onChange={(e) => setTopN(+e.target.value)}>
          {[20, 45, 80, 150].map((n) => <option key={n} value={n}>Top {n} edges</option>)}
        </select>
      }
    >
      <div className="grid g-2" style={{ alignItems: 'center' }}>
        <div ref={ref} style={{ display: 'flex', justifyContent: 'center' }}>
          <svg width={size} height={size} className="chart">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto-start-reverse">
                <path d="M0 0L10 5L0 10z" fill="rgba(255,255,255,0.75)" />
              </marker>
            </defs>
            {edges.map((e, i) => {
              const s = pos[e.src]
              const t = pos[e.dst]
              if (!s || !t) return null
              const on = hov == null || hov === e.src || hov === e.dst
              const mx = (s.x + t.x) / 2 + (size / 2 - (s.x + t.x) / 2) * 0.55
              const my = (s.y + t.y) / 2 + (size / 2 - (s.y + t.y) / 2) * 0.55
              return (
                <motion.path
                  key={`${e.src}-${e.dst}`}
                  d={`M${s.x},${s.y} Q${mx},${my} ${t.x},${t.y}`}
                  fill="none"
                  stroke={hov === e.dst ? meta.byCode[e.dst].color : meta.byCode[e.src]?.color}
                  strokeWidth={w(e.duration_seconds)}
                  markerEnd="url(#arrow)"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: on ? 0.75 : 0.05 }}
                  animate={{ opacity: on ? 0.75 : 0.05 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: i * 0.01 }}
                />
              )
            })}
            {order.map((c) => {
              const p = pos[c]
              const d = meta.byCode[c]
              const lx = size / 2 + (r + 30) * Math.cos(p.a)
              const ly = size / 2 + (r + 30) * Math.sin(p.a)
              return (
                <g key={c} onMouseEnter={() => setHov(c)} onMouseLeave={() => setHov(null)} style={{ cursor: 'pointer' }}>
                  <circle cx={p.x} cy={p.y} r={hov === c ? 12 : 9} fill={d.color} stroke="#000" strokeWidth={2} />
                  <text x={lx} y={ly + 4} textAnchor="middle" style={{ fill: hov === c ? '#fff' : '#c9c9d4', fontWeight: 700, fontSize: 12 }}>{c}</text>
                </g>
              )
            })}
          </svg>
        </div>
        <div>
          <table className="table">
            <thead>
              <tr>
                <th>Chaser</th>
                <th>Car ahead</th>
                <th className="num">Time &lt; 50 m</th>
                <th className="num">Closest</th>
              </tr>
            </thead>
            <tbody>
              {(hov ? chase.edges.filter((e) => e.src === hov || e.dst === hov) : chase.edges).slice(0, 10).map((e) => (
                <tr key={`${e.src}-${e.dst}`}>
                  <td><DriverName d={meta.byCode[e.src]} short /></td>
                  <td><DriverName d={meta.byCode[e.dst]} short /></td>
                  <td className="num">{e.duration_seconds.toFixed(0)} s</td>
                  <td className="num">{e.min_distance.toFixed(1)} m</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hov && (
            <p className="muted" style={{ fontSize: 13 }}>
              <b style={{ color: '#fff' }}>{meta.byCode[hov].last}</b> spent {stats[hov].chasing.toFixed(0)} s chasing other cars and had a car within 50 m
              behind for {stats[hov].chased.toFixed(0)} s.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}

function Anomalies({ rows, meta }) {
  const max = d3.max(rows, (r) => r.anomaly_score)
  const scale = d3.scaleLog().domain([d3.min(rows, (r) => r.anomaly_score), max]).range([8, 100])
  return (
    <Card
      title="Telemetry anomalies · K-Means distance"
      note="Every lap's telemetry profile is clustered with K-Means (K = 5); laps furthest from their cluster centre (top 1%) are flagged. Most are garage outings, aborted laps or crash laps."
    >
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Session</th>
              <th>Driver</th>
              <th className="num">Lap</th>
              <th>Tyre</th>
              <th className="num">Avg km/h</th>
              <th className="num">Max km/h</th>
              <th className="num">Throttle</th>
              <th className="num">Braking</th>
              <th style={{ width: '24%' }}>Anomaly score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="muted">{r.session}</td>
                <td><DriverName d={meta.byCode[r.driver]} short /></td>
                <td className="num">{r.lap}</td>
                <td><Tyre c={r.compound} size={18} age={r.tyre_life} /></td>
                <td className="num">{r.avg_speed.toFixed(0)}</td>
                <td className="num">{r.max_speed.toFixed(0)}</td>
                <td className="num">{r.avg_throttle.toFixed(0)}%</td>
                <td className="num">{(r.braking_percent * 100).toFixed(0)}%</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 8, background: 'var(--bg-2)', borderRadius: 4 }}>
                      <div style={{ width: `${scale(r.anomaly_score)}%`, height: '100%', background: 'var(--red)', borderRadius: 4 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 12, width: 48, textAlign: 'right' }}>{r.anomaly_score.toFixed(1)}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
