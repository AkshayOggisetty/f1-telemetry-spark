import { useEffect, useMemo, useState } from 'react'
import * as d3 from 'd3'
import { Card, Page, PageHead, Ready, Reveal, Seg, SessionPicker, Tyre, useMeta, useSession } from '../components/ui'
import { LineChart } from '../components/charts'
import { ColoredPath, TrackMap } from '../components/TrackMap'
import { sessionFile, useData } from '../lib/data'
import { gap, lapTime } from '../lib/format'

const MINI = 27 // minisectors for the dominance map
const ALT = ['#ffffff', '#ff8700'] // used when two picked drivers share a team colour

export default function Telemetry() {
  const [meta, e1] = useMeta()
  const [slug] = useSession()
  const [data, e2] = useData(sessionFile(slug, 'fastest'), sessionFile(slug, 'results'))
  const session = meta?.sessions.find((s) => s.slug === slug)
  return (
    <Page>
      <PageHead kicker="Fastest-lap telemetry" title="Telemetry comparison" right={meta && <SessionPicker sessions={meta.sessions} />}>
        Each driver's fastest push lap in {session ? session.name : 'the session'}, from Spark's <code className="mono">analysis_v2/fastest_laps</code>{' '}
        table, resampled every 10 m. Hover any chart to scrub all of them and the map together.
      </PageHead>
      <Ready error={e1 || e2} ready={meta && data && session}>
        {() => <TeleView key={slug} meta={meta} fastest={data[0]} results={data[1]} />}
      </Ready>
    </Page>
  )
}

function TeleView({ meta, fastest, results }) {
  const ranked = results.classification.map((r) => r.code).filter((c) => fastest[c])
  const byLap = [...ranked].sort((a, b) => (fastest[a].lapTime ?? 1e9) - (fastest[b].lapTime ?? 1e9))
  const [picked, setPicked] = useState(byLap.slice(0, 2))
  const [hover, setHover] = useState(null)
  const [mapMode, setMapMode] = useState('dominance')

  useEffect(() => setPicked(byLap.slice(0, 2)), [fastest]) // eslint-disable-line react-hooks/exhaustive-deps

  const colors = useMemo(() => {
    const out = {}
    picked.forEach((c, i) => {
      const d = meta.byCode[c]
      const clash = picked.slice(0, i).some((o) => meta.byCode[o].team === d.team)
      out[c] = clash ? ALT[i % 2] : d.color
    })
    return out
  }, [picked, meta])

  const ref = picked[0]
  const lapLen = Math.min(...picked.map((c) => fastest[c].d[fastest[c].d.length - 1]))

  const series = (key, scale = 1) =>
    picked.map((c) => ({
      id: c,
      color: colors[c],
      points: fastest[c].d.map((d, i) => ({ x: d, y: fastest[c][key][i] * scale })),
    }))

  const delta = useMemo(() => {
    const R = fastest[ref]
    return picked.slice(1).map((c) => {
      const F = fastest[c]
      return {
        id: c,
        color: colors[c],
        // Both laps are resampled on the same 10 m grid, so index i is the same distance.
        points: F.d.filter((d, i) => d <= lapLen && i < R.t.length).map((d, i) => ({ x: d, y: F.t[i] - R.t[i] })),
      }
    })
  }, [picked, fastest, ref, colors, lapLen])

  const markers = meta.circuit.corners.map((c) => ({ x: c.d, label: c.n }))
  const common = { xDomain: [0, lapLen], xLabel: 'Distance (m)', formatX: (v) => `${(v / 1000).toFixed(1)}k`, hoverX: hover, onHoverX: setHover, markers }

  // Minisector dominance: who covers each slice of the lap fastest.
  const dominance = useMemo(() => {
    const R = fastest[ref]
    const edges = d3.range(MINI + 1).map((k) => (k / MINI) * lapLen)
    const timeAt = (F, d) => {
      const i = Math.min(F.d.length - 1, Math.round(d / 10))
      return F.t[i]
    }
    const segColors = []
    for (let i = 0; i < R.d.length - 1 && R.d[i] <= lapLen; i++) {
      const k = Math.min(MINI - 1, Math.floor((R.d[i] / lapLen) * MINI))
      const [a, b] = [edges[k], edges[k + 1]]
      let best = null
      for (const c of picked) {
        const F = fastest[c]
        const dt = timeAt(F, b) - timeAt(F, a)
        if (!best || dt < best.dt) best = { c, dt }
      }
      segColors.push(colors[best.c])
    }
    return segColors
  }, [picked, fastest, ref, colors, lapLen])

  const speedColors = useMemo(() => {
    const R = fastest[ref]
    const sc = d3.scaleSequential(d3.interpolateTurbo).domain([80, 340])
    return R.speed.map((s) => sc(s))
  }, [fastest, ref])

  const toggle = (c) =>
    setPicked((p) => (p.includes(c) ? (p.length > 1 ? p.filter((x) => x !== c) : p) : p.length >= 3 ? [...p.slice(1), c] : [...p, c]))

  const R = fastest[ref]
  const hi = hover == null ? null : Math.min(R.d.length - 1, Math.round(hover / 10))

  return (
    <>
      <Card title="Pick up to three drivers" style={{ marginBottom: 18 }}>
        <div className="chips">
          {byLap.map((c) => {
            const d = meta.byCode[c]
            return (
              <span key={c} className={`chip ${picked.includes(c) ? 'sel' : 'off'}`} onClick={() => toggle(c)}>
                <i style={{ background: d.color }} />
                {c} <span className="mono dim" style={{ fontWeight: 400 }}>{lapTime(fastest[c].lapTime)}</span>
              </span>
            )
          })}
        </div>
      </Card>

      <div className="grid g-3" style={{ marginBottom: 18 }}>
        {picked.map((c) => {
          const d = meta.byCode[c]
          const F = fastest[c]
          return (
            <Reveal key={c}>
              <div className="card stat" style={{ borderLeft: `4px solid ${colors[c]}` }}>
                <div className="stat-label">{d.first} {d.last} · lap {F.lap}</div>
                <div className="stat-value mono">{lapTime(F.lapTime)}</div>
                <div className="stat-sub" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Tyre c={F.compound} size={18} />
                  Top speed <b style={{ color: '#fff' }}>{Math.max(...F.speed)} km/h</b>
                  {c !== ref && <span className="mono" style={{ color: F.lapTime > R.lapTime ? 'var(--red-2)' : 'var(--green)' }}>{gap(F.lapTime - R.lapTime)}</span>}
                </div>
              </div>
            </Reveal>
          )
        })}
      </div>

      <div className="tele-layout">
        <div className="grid" style={{ gap: 16 }}>
          <Card title="Speed">
            <LineChart series={series('speed')} height={260} yLabel="km/h" {...common} animate={false} />
          </Card>
          {delta.length > 0 && (
            <Card title={`Delta to ${ref}`} note={`Above zero = slower than ${ref} at that point of the lap.`}>
              <LineChart
                series={[{ id: 'zero', color: 'rgba(255,255,255,0.3)', points: [{ x: 0, y: 0 }, { x: lapLen, y: 0 }], hideTip: true, width: 1 }, ...delta]}
                height={180}
                yLabel="s"
                formatY={(v) => v.toFixed(2)}
                {...common}
                animate={false}
              />
            </Card>
          )}
          <Card title="Throttle">
            <LineChart series={series('throttle')} height={150} yLabel="%" yDomain={[0, 100]} yTicks={4} {...common} animate={false} />
          </Card>
          <div className="grid g-2" style={{ gap: 16 }}>
            <Card title="Brake">
              <LineChart series={series('brake', 100)} height={130} yDomain={[0, 100]} yTicks={1} formatY={(v) => (v ? 'ON' : 'OFF')} curve={d3.curveStepAfter} {...common} animate={false} />
            </Card>
            <Card title="Gear">
              <LineChart series={series('gear')} height={130} yDomain={[1, 8]} yTicks={4} curve={d3.curveStepAfter} {...common} animate={false} />
            </Card>
          </div>
        </div>

        <div style={{ position: 'sticky', top: 80 }}>
          <Card
            title="Track map"
            right={
              <Seg
                value={mapMode}
                onChange={setMapMode}
                options={[
                  { value: 'dominance', label: 'Dominance' },
                  { value: 'speed', label: `Speed ${ref}` },
                ]}
              />
            }
          >
            <div style={{ aspectRatio: '1.3' }}>
              <TrackMap circuit={meta.circuit} width={10} color="#24242e">
                <ColoredPath xs={R.x.filter((_, i) => R.d[i] <= lapLen)} ys={R.y.filter((_, i) => R.d[i] <= lapLen)} colors={mapMode === 'dominance' ? dominance : speedColors} width={20} />
                {hi != null &&
                  picked.map((c) => {
                    const F = fastest[c]
                    const i = Math.min(F.x.length - 1, hi)
                    return <circle key={c} cx={F.x[i]} cy={F.y[i]} r={30} fill={colors[c]} stroke="#000" strokeWidth={6} />
                  })}
              </TrackMap>
            </div>
            {mapMode === 'dominance' ? (
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13 }}>
                {picked.map((c) => (
                  <span key={c}>
                    <span className="legend-line" style={{ background: colors[c], height: 6 }} />
                    {c} · {dominance.filter((x) => x === colors[c]).length > 0 ? Math.round((dominance.filter((x) => x === colors[c]).length / dominance.length) * 100) : 0}% of lap
                  </span>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12 }} className="muted">
                <div style={{ height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${d3.range(0, 1.01, 0.1).map((v) => d3.interpolateTurbo(v)).join(',')})` }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>80 km/h</span>
                  <span>340 km/h</span>
                </div>
              </div>
            )}
            {hi != null && (
              <div className="mono" style={{ marginTop: 10, fontSize: 12.5, display: 'grid', gap: 3 }}>
                <span className="dim">{Math.round(R.d[hi])} m into the lap</span>
                {picked.map((c) => {
                  const F = fastest[c]
                  const i = Math.min(F.speed.length - 1, hi)
                  return (
                    <span key={c}>
                      <span className="legend-line" style={{ background: colors[c] }} />
                      {c} {F.speed[i]} km/h · G{F.gear[i]} · {F.throttle[i]}% {F.brake[i] ? '· BRAKE' : ''} {F.drs[i] ? '· DRS' : ''}
                    </span>
                  )
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
