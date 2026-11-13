import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Card, DriverChips, DriverName, Page, PageHead, Ready, Reveal, Seg, Tyre, useMeta, useToggleSet } from '../components/ui'
import { LineChart, useWidth } from '../components/charts'
import { sessionFile, useData } from '../lib/data'
import { compound, gap, lapTime, TRACK_STATUS } from '../lib/format'
import { gapToLeader, leaderLapEnds, periodsToLaps, positions, raceTrace, statusPeriods } from '../lib/race'

export default function RaceAnalysis() {
  const [meta, e1] = useMeta()
  const [data, e2] = useData(sessionFile('race', 'laps'), sessionFile('race', 'results'), sessionFile('race', 'events'))
  return (
    <Page>
      <PageHead kicker="Race · 51 laps" title="Race analysis">
        How the Azerbaijan Grand Prix unfolded lap by lap: gaps, pace, positions and tyre strategy. Shaded areas show yellow flags and Safety Car periods.
      </PageHead>
      <Ready error={e1 || e2} ready={meta && data}>
        {() => <RaceView meta={meta} laps={data[0]} results={data[1]} events={data[2]} />}
      </Ready>
    </Page>
  )
}

function RaceView({ meta, laps, results, events }) {
  const order = results.classification.map((r) => r.code)
  const drivers = order.map((c) => meta.byCode[c])
  const [active, toggle, only, all] = useToggleSet(order.slice(0, 10))
  const [hover, setHover] = useState(null)
  const [cap, setCap] = useState('60')

  const lead = useMemo(() => leaderLapEnds(laps), [laps])
  const bands = useMemo(() => {
    const end = Math.max(...Object.values(laps).flatMap((L) => L.map((l) => l.end || 0)))
    return periodsToLaps(statusPeriods(events.trackStatus, end), lead)
      .filter((p) => p.to > 0.5)
      .map((p) => ({
        from: Math.max(0, p.from),
        to: p.to,
        color: (TRACK_STATUS[p.code] || {}).color || '#ffd12e',
        label: p.code === '4' ? 'SC' : p.code === '6' ? 'VSC' : p.code === '5' ? 'RED' : null,
        opacity: p.code === '2' ? 0.06 : 0.14,
      }))
  }, [events, laps, lead])

  const worm = useMemo(() => gapToLeader(laps), [laps])
  const trace = useMemo(() => raceTrace(laps, order[0]), [laps, order])
  const pos = useMemo(() => positions(laps), [laps])

  const mk = (src, filter = () => true) =>
    drivers
      .filter((d) => active.has(d.code))
      .map((d) => ({ id: d.code, color: d.color, dash: d.second, points: (src[d.code] || []).filter(filter) }))

  const capV = cap === 'all' ? Infinity : +cap
  const chips = (
    <div style={{ display: 'grid', gap: 10 }}>
      <DriverChips drivers={drivers} active={active} onToggle={toggle} onOnly={only} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={() => all(order.slice(0, 10))}>Top 10</button>
        <button className="btn" onClick={() => all(order)}>All</button>
        <button className="btn" onClick={() => all([])}>None</button>
      </div>
    </div>
  )

  return (
    <div className="grid" style={{ gap: 18 }}>
      <Reveal>
        <Card title="Classification">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Team</th>
                  <th className="num">Laps</th>
                  <th className="num">Gap</th>
                  <th className="num">Best lap</th>
                  <th>Strategy</th>
                  <th className="num">Pts</th>
                </tr>
              </thead>
              <tbody>
                {results.classification.map((r) => {
                  const d = meta.byCode[r.code]
                  const st = results.stints.filter((s) => s.driver === r.code)
                  const fastest = results.classification.reduce((a, b) => ((b.best ?? 1e9) < (a.best ?? 1e9) ? b : a))
                  return (
                    <tr key={r.code}>
                      <td><span className="pos">{r.pos}</span></td>
                      <td><DriverName d={d} /></td>
                      <td className="muted">{d.team}</td>
                      <td className="num">{r.laps}</td>
                      <td className="num">{r.pos === 1 ? lapTime(r.raceTime) : r.status === 'Finished' ? gap(r.gap) : r.status}</td>
                      <td className="num" style={{ color: fastest.code === r.code ? 'var(--purple)' : undefined }}>{lapTime(r.best)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', gap: 4 }}>
                          {st.map((s) => <Tyre key={s.stint} c={s.compound} size={18} />)}
                        </span>
                      </td>
                      <td className="num"><b>{r.points || ''}</b></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>
            Order is the official classification (includes time penalties). Gaps are measured at the finish line from timing data.
          </p>
        </Card>
      </Reveal>

      <Reveal>
        <Card
          title="The worm · gap to leader"
          right={
            <Seg
              value={cap}
              onChange={setCap}
              options={[
                { value: '30', label: '< 30 s' },
                { value: '60', label: '< 60 s' },
                { value: 'all', label: 'All' },
              ]}
            />
          }
          note="Seconds behind the race leader at the end of every lap. Lines falling away show a driver losing time; flat sections under the Safety Car show the field bunching up."
        >
          {chips}
          <div style={{ marginTop: 12 }}>
            <LineChart
              series={mk(worm, (p) => p.y <= capV)}
              height={420}
              invertY
              xLabel="Lap"
              yLabel="Gap to leader (s)"
              formatY={(v) => v.toFixed(1)}
              xDomain={[1, 51]}
              bands={bands}
              hoverX={hover}
              onHoverX={setHover}
              tooltipSort="asc"
            />
          </div>
        </Card>
      </Reveal>

      <div className="grid g-2">
        <Reveal>
          <Card title="Race trace" note={`Time gained (+) or lost (−) against ${meta.byCode[order[0]].last}'s average lap.`}>
            <LineChart
              series={mk(trace, (p) => p.y > -150)}
              height={340}
              xLabel="Lap"
              yLabel="Delta (s)"
              formatY={(v) => v.toFixed(1)}
              xDomain={[1, 51]}
              bands={bands}
              hoverX={hover}
              onHoverX={setHover}
            />
          </Card>
        </Reveal>
        <Reveal delay={0.05}>
          <Card title="Position chart" note="Running position at the end of each lap.">
            <LineChart
              series={mk(pos)}
              height={340}
              invertY
              yDomain={[1, 20]}
              yNice={false}
              yTicks={10}
              xLabel="Lap"
              yLabel="Position"
              formatY={(v) => `P${v}`}
              xDomain={[1, 51]}
              bands={bands}
              hoverX={hover}
              onHoverX={setHover}
              tooltipSort="asc"
            />
          </Card>
        </Reveal>
      </div>

      <Reveal>
        <Card title="Tyre strategy" note="Each bar is one stint, from Spark's stints table (analysis_v2/stints). Numbers show the stint length in laps.">
          <Strategy meta={meta} order={order} stints={results.stints} total={51} />
        </Card>
      </Reveal>
    </div>
  )
}

function Strategy({ meta, order, stints, total }) {
  const [ref, width] = useWidth()
  const left = 64
  const row = 26
  const iw = width - left - 10
  const x = (lap) => left + ((lap - 1) / total) * iw
  const h = order.length * row + 30
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h}>
        {[1, 10, 20, 30, 40, 51].map((l) => (
          <g key={l}>
            <line x1={x(l)} x2={x(l)} y1={0} y2={h - 22} stroke="rgba(255,255,255,0.05)" />
            <text x={x(l)} y={h - 6} textAnchor="middle">
              {l}
            </text>
          </g>
        ))}
        {order.map((code, i) => {
          const d = meta.byCode[code]
          return (
            <g key={code} transform={`translate(0,${i * row})`}>
              <rect x={0} y={5} width={4} height={16} fill={d.color} rx={2} />
              <text x={12} y={18} style={{ fill: '#fff', fontWeight: 700, fontSize: 12.5 }}>
                {code}
              </text>
              {stints
                .filter((s) => s.driver === code)
                .map((s, k) => {
                  const c = compound(s.compound)
                  const w = Math.max(2, x(s.end_lap + 1) - x(s.start_lap) - 2)
                  return (
                    <g key={s.stint}>
                      <motion.rect
                        x={x(s.start_lap)}
                        y={4}
                        height={18}
                        rx={4}
                        fill={c.color}
                        initial={{ width: 0 }}
                        whileInView={{ width: w }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.7, delay: i * 0.02 + k * 0.12, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <title>{`${code} · stint ${s.stint} · ${s.compound} · laps ${s.start_lap}–${s.end_lap}`}</title>
                      </motion.rect>
                      {w > 26 && (
                        <text x={x(s.start_lap) + 7} y={17} style={{ fill: '#000', fontWeight: 800, fontSize: 11 }} pointerEvents="none">
                          {s.laps}
                        </text>
                      )}
                    </g>
                  )
                })}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
