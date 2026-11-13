import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Card, Page, PageHead, Ready, Seg, SessionPicker, Tyre, useMeta, useSession } from '../components/ui'
import { TrackMap } from '../components/TrackMap'
import { LineChart } from '../components/charts'
import { asset, sessionFile, useData } from '../lib/data'
import { clock, gap, lapTime, TRACK_STATUS } from '../lib/format'
import { gapToLeader, leaderLapEnds } from '../lib/race'

const SPEEDS = [1, 2, 4, 8, 16, 32]
const ROW_H = 32
const LOOP = 50 // progress units per timing loop: 1000 per lap → 20 loops per lap

export default function Replay() {
  const [meta, metaErr] = useMeta()
  const [slug] = useSession()
  const [data, err] = useData(sessionFile(slug, 'replay'), sessionFile(slug, 'laps'), sessionFile(slug, 'events'), sessionFile(slug, 'results'))
  const session = meta?.sessions.find((s) => s.slug === slug)

  return (
    <Page>
      <PageHead
        kicker="Live timing replay"
        title={session ? `${session.name} replay` : 'Replay'}
        right={meta && <SessionPicker sessions={meta.sessions} />}
      >
        Car positions rebuilt from {meta ? meta.dataset.telemetryRows.toLocaleString() : 'raw'} telemetry samples, resampled every 0.5 s. Click a
        driver in the tower or on the map to follow them.
      </PageHead>
      <Ready error={metaErr || err} ready={meta && data && session} label="Loading replay">
        {() => <ReplayView key={slug} meta={meta} session={session} replay={data[0]} laps={data[1]} events={data[2]} results={data[3]} />}
      </Ready>
    </Page>
  )
}

function ReplayView({ meta, session, replay, laps, events, results }) {
  const isRace = session.slug === 'race'
  const t0 = replay.t0
  const tEnd = t0 + (replay.n - 1) * replay.dt
  const startT = isRace && events.start ? events.start : t0

  const [t, setT] = useState(startT)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(isRace ? 8 : 16)
  const [selected, setSelected] = useState(null)
  const [mode, setMode] = useState('interval')
  const [labels, setLabels] = useState(true)
  const [tab, setTab] = useState('control')
  const tRef = useRef(t)
  tRef.current = t

  // ---- playback loop ----
  useEffect(() => {
    if (!playing) return
    let raf
    let last = performance.now()
    const tick = (now) => {
      const next = Math.min(tEnd, tRef.current + ((now - last) / 1000) * speed)
      last = now
      setT(next)
      if (next >= tEnd) setPlaying(false)
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, tEnd])

  // ---- keyboard shortcuts ----
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.code === 'Space') {
        e.preventDefault()
        setPlaying((p) => !p)
      } else if (e.code === 'ArrowRight') setT((v) => Math.min(tEnd, v + 10))
      else if (e.code === 'ArrowLeft') setT((v) => Math.max(t0, v - 10))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t0, tEnd])

  // ---- static per-session lookups ----
  const codes = useMemo(() => Object.keys(replay.cars).filter((c) => meta.byCode[c]), [replay, meta])
  const lead = useMemo(() => leaderLapEnds(laps), [laps])
  const status = useMemo(() => Object.fromEntries(results.classification.map((r) => [r.code, r])), [results])
  const lastValid = useMemo(() => {
    const out = {}
    for (const c of codes) {
      const p = replay.cars[c].p
      let i = p.length - 1
      while (i >= 0 && p[i] == null) i--
      out[c] = i
    }
    return out
  }, [codes, replay])

  // Timing loops: split every lap into LOOPS points (progress is laps × 1000).
  // crossings[c][k] = first frame at which car c passed loop k. Ordering and gaps
  // use these, like real F1 timing, so cars side by side don't flicker.
  const crossings = useMemo(() => {
    const out = {}
    for (const c of codes) {
      const P = replay.cars[c].p
      // Fractional frame of each crossing, interpolated between samples.
      const arr = []
      let lastI = -10
      for (let i = 0; i < P.length; i++) {
        const v = P[i]
        if (v == null) continue
        const k = Math.floor(v / LOOP)
        // a car covers < 1 loop (~300 m) per 0.5 s frame; skip one-frame spikes
        if (i - lastI <= 2 && k > arr.length + 3) continue
        const pv = i - lastI === 1 ? P[lastI] : null
        while (arr.length <= k) {
          const target = arr.length * LOOP
          arr.push(pv != null && v > pv && target > pv ? lastI + (target - pv) / (v - pv) : i)
        }
        lastI = i
      }
      out[c] = arr
    }
    return out
  }, [codes, replay])

  const frame = (t - t0) / replay.dt
  const fi = Math.max(0, Math.min(replay.n - 1, Math.floor(frame)))
  const frac = frame - fi

  const carAt = useCallback(
    (c) => {
      const car = replay.cars[c]
      const x0 = car.x[fi]
      if (x0 == null) return null
      const x1 = car.x[fi + 1]
      const y0 = car.y[fi]
      const y1 = car.y[fi + 1]
      const k = x1 == null ? 0 : frac
      return { x: x0 + ((x1 ?? x0) - x0) * k, y: y0 + ((y1 ?? y0) - y0) * k, s: car.s[fi] }
    },
    [replay, fi, frac],
  )

  // ---- timing tower ----
  const tower = useMemo(() => {
    const rows = codes.map((c) => {
      const L = laps[c] || []
      let done = 0
      while (done < L.length && L[done].end != null && L[done].end <= t) done++
      const cur = L[Math.min(done, L.length - 1)] || {}
      // last timing loop passed at or before this frame (binary search)
      const C = crossings[c]
      let lo = 0
      let hi = C.length - 1
      let k = -1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (C[mid] <= frame) {
          k = mid
          lo = mid + 1
        } else hi = mid - 1
      }
      const kf = k >= 0 ? C[k] : Infinity
      const finished = isRace && L.length > 0 && done === L.length && status[c]?.status !== 'DNF'
      const retired = isRace && !finished && fi > lastValid[c] && status[c]?.status === 'DNF'
      // In the pit lane between a lap's pit-in time and the next lap's pit-out time.
      const inPit = L.some((l, k) => l.pitIn != null && l.pitIn <= t && t <= (L[k + 1]?.pitOut ?? l.pitIn + 60))
      const timed = L.slice(0, done).filter((l) => l.time && !l.deleted)
      const best = timed.length ? Math.min(...timed.map((l) => l.time)) : null
      const lastLap = done > 0 ? L[done - 1].time : null
      return { code: c, done, cur, k, kf, finished, retired, inPit, best, lastLap, endT: done > 0 ? L[done - 1].end : null }
    })

    if (isRace) {
      rows.sort((a, b) => {
        if (a.retired !== b.retired) return a.retired ? 1 : -1
        if (a.finished && b.finished) return b.done - a.done || a.endT - b.endT
        if (a.finished !== b.finished) return a.finished ? -1 : 1
        return b.k - a.k || a.kf - b.kf
      })
      const leader = rows[0]
      const perLap = 1000 / LOOP
      rows.forEach((r, i) => {
        const lapsDown = leader.finished || r.finished ? 0 : Math.floor((leader.k - r.k) / perLap)
        if (r.finished) r.gap = lead[r.done] != null ? r.endT - lead[r.done] : null
        else {
          // time between the leader and this car passing the same timing loop
          const lf = crossings[leader.code][r.k]
          r.gap = r.k >= 0 && lf != null && !leader.finished ? (r.kf - lf) * replay.dt : r.done > 0 && lead[r.done] != null ? r.endT - lead[r.done] : null
        }
        if (i === 0) r.text = 'LEADER'
        else if (r.retired) r.text = 'OUT'
        else if (r.inPit) r.text = 'PIT'
        else if (lapsDown >= 1 && !r.finished) r.text = `+${lapsDown} LAP${lapsDown > 1 ? 'S' : ''}`
        else if (mode === 'leader') r.text = gap(r.gap)
        else {
          const prev = rows[i - 1]
          r.text = r.gap != null && prev.gap != null ? gap(r.gap - prev.gap) : '—'
        }
      })
    } else {
      rows.sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9) || a.code.localeCompare(b.code))
      const top = rows[0].best
      rows.forEach((r, i) => {
        r.text = r.best == null ? (r.inPit ? 'PIT' : 'NO TIME') : i === 0 ? lapTime(r.best) : gap(r.best - top)
      })
    }
    return rows
  }, [codes, laps, t, fi, replay, isRace, status, lastValid, lead, mode, crossings])

  const leaderDone = isRace ? Math.max(0, ...tower.map((r) => r.done)) : 0
  const totalLaps = events.totalLaps || session.maxLap
  const fastestSoFar = useMemo(() => {
    let best = null
    for (const r of tower) if (r.best != null && (best == null || r.best < best.t)) best = { t: r.best, code: r.code }
    return best
  }, [tower])

  // ---- flags, messages, radio ----
  const curStatus = [...events.trackStatus].reverse().find((s) => s.t <= t)
  const statusInfo = curStatus && curStatus.code !== '1' ? TRACK_STATUS[curStatus.code] || { label: curStatus.label, color: '#ffd12e' } : null
  const trackColor = curStatus?.code === '5' ? '#5a1414' : curStatus?.code === '4' || curStatus?.code === '6' ? '#5a4a10' : '#3a3a48'
  const messages = events.raceControl.filter((m) => m.t <= t).slice(-40).reverse()
  const radios = events.radio.filter((r) => r.t <= t).reverse()

  const [popup, setPopup] = useState(null)
  const radioCount = radios.length
  const prevCount = useRef(radioCount)
  useEffect(() => {
    if (playing && radioCount > prevCount.current) setPopup(radios[0])
    prevCount.current = radioCount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioCount, playing])
  useEffect(() => {
    if (!popup) return
    const id = setTimeout(() => setPopup(null), 7000)
    return () => clearTimeout(id)
  }, [popup])

  const sel = selected && meta.byCode[selected]
  const selRow = tower.find((r) => r.code === selected)
  const selCar = selected ? carAt(selected) : null

  const sessionClock = isRace ? t - (events.start || t0) : t - t0
  const periods = events.trackStatus
    .map((s, i) => ({ ...s, to: events.trackStatus[i + 1]?.t ?? tEnd }))
    .filter((s) => s.code !== '1' && s.to > t0)

  return (
    <div className="replay">
      {/* ---------- timing tower ---------- */}
      <div className="card tower">
        <div className="tower-head">
          <div className="tower-lap">
            {isRace ? (
              leaderDone >= totalLaps ? (
                <>🏁 <small>FINISH</small></>
              ) : (
                <>
                  LAP {Math.min(totalLaps, leaderDone + 1)} <small>/ {totalLaps}</small>
                </>
              )
            ) : (
              <>
                {clock(sessionClock)} <small>{session.short}</small>
              </>
            )}
          </div>
          {isRace && (
            <Seg
              value={mode}
              onChange={setMode}
              options={[
                { value: 'interval', label: 'Int' },
                { value: 'leader', label: 'Gap' },
              ]}
            />
          )}
        </div>
        <div className="tower-rows" style={{ height: tower.length * ROW_H }}>
          {tower.map((r, i) => {
            const d = meta.byCode[r.code]
            const isFast = fastestSoFar && fastestSoFar.code === r.code && isRace
            return (
              <div
                key={r.code}
                className={`tower-row ${selected === r.code ? 'sel' : ''} ${isFast ? 'fastest' : ''}`}
                style={{ transform: `translateY(${i * ROW_H}px)`, opacity: r.retired ? 0.45 : 1 }}
                onClick={() => setSelected(selected === r.code ? null : r.code)}
                title={`${d.first} ${d.last}`}
              >
                <span className="p">{i + 1}</span>
                <span className="bar" style={{ background: d.color }} />
                <span>{r.code}</span>
                <span className={`gap ${r.text === 'PIT' ? 'pit' : ''} ${r.text === 'OUT' ? 'out' : ''}`}>{r.text}</span>
                <Tyre c={r.cur.compound} size={20} />
              </div>
            )
          })}
        </div>
      </div>

      {/* ---------- track map + controls ---------- */}
      <div className="card map-card">
        <div className="map-wrap">
          <AnimatePresence>
            {statusInfo && (
              <motion.div
                key={statusInfo.label}
                className="status-banner"
                style={{ background: statusInfo.color }}
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
              >
                {statusInfo.label}
              </motion.div>
            )}
          </AnimatePresence>
          <div style={{ aspectRatio: '1.45', maxHeight: '68vh', margin: '0 auto', padding: 8 }}>
            <TrackMap circuit={meta.circuit} color={trackColor} width={18}>
              {[...codes]
                .sort((a, b) => (a === selected) - (b === selected))
                .map((c) => {
                  const pos = carAt(c)
                  if (!pos) return null
                  const d = meta.byCode[c]
                  const isSel = c === selected
                  const dim = selected && !isSel
                  return (
                    <g
                      key={c}
                      transform={`translate(${pos.x},${pos.y})`}
                      style={{ cursor: 'pointer' }}
                      opacity={dim ? 0.55 : 1}
                      onClick={() => setSelected(isSel ? null : c)}
                    >
                      {isSel && <circle r={46} fill="none" stroke="#fff" strokeWidth={5} />}
                      <circle r={isSel ? 30 : 24} fill={d.color} stroke="#000" strokeWidth={5} />
                      {(labels || isSel) && (
                        <text x={36} y={12} fontSize={isSel ? 44 : 36} fontWeight={900} fill="#fff" stroke="#000" strokeWidth={8} paintOrder="stroke" fontFamily="Titillium Web">
                          {c}
                        </text>
                      )}
                    </g>
                  )
                })}
            </TrackMap>
          </div>
        </div>
        <div className="replay-controls">
          <button className="btn primary icon" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'} style={{ width: 42, justifyContent: 'center' }}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div className="replay-time">
            {clock(sessionClock)}
            {isRace && <span className="dim"> · L{Math.min(totalLaps, leaderDone + 1)}</span>}
          </div>
          <div className="scrub">
            <div className="scrub-marks">
              {periods.map((p, i) => (
                <i
                  key={i}
                  style={{
                    left: `${((Math.max(p.t, t0) - t0) / (tEnd - t0)) * 100}%`,
                    width: `${Math.max(0.4, ((p.to - Math.max(p.t, t0)) / (tEnd - t0)) * 100)}%`,
                    background: (TRACK_STATUS[p.code] || {}).color || '#ffd12e',
                    opacity: 0.8,
                  }}
                />
              ))}
            </div>
            <input type="range" min={t0} max={tEnd} step={replay.dt} value={t} onChange={(e) => setT(+e.target.value)} aria-label="Session time" />
          </div>
          <Seg value={speed} onChange={setSpeed} options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))} />
          <button className="btn" onClick={() => setLabels((v) => !v)} title="Toggle driver labels">
            {labels ? 'Labels on' : 'Labels off'}
          </button>
        </div>
      </div>

      {/* ---------- side panels ---------- */}
      <div className="replay-side" style={{ display: 'grid', gap: 16 }}>
        <Card title={sel ? 'Following' : 'Driver'}>
          {sel ? (
            <div>
              <div className="driver-card">
                <img src={asset(sel.photo)} alt={sel.last} />
                <div>
                  <div className="muted" style={{ fontSize: 12.5, fontWeight: 700 }}>
                    #{sel.number} · {sel.team}
                  </div>
                  <div className="driver-name" style={{ marginTop: 4 }}>
                    {sel.first}
                    <br />
                    <span style={{ color: sel.color }}>{sel.last}</span>
                  </div>
                </div>
              </div>
              <div className="gauge">
                <div>
                  <div className="v">{selCar ? Math.floor(selCar.s / 10) : '—'}</div>
                  <div className="l">km/h</div>
                </div>
                <div>
                  <div className="v">{selCar ? selCar.s % 10 || 'N' : '—'}</div>
                  <div className="l">Gear</div>
                </div>
                <div>
                  <div className="v">P{tower.findIndex((r) => r.code === selected) + 1}</div>
                  <div className="l">Position</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 14, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                <Tyre c={selRow?.cur.compound} size={26} age={selRow?.cur.tyre != null ? `${selRow.cur.tyre} laps` : null} />
                <span className="muted">
                  Last <b className="mono" style={{ color: '#fff' }}>{lapTime(selRow?.lastLap)}</b>
                </span>
                <span className="muted">
                  Best <b className="mono" style={{ color: '#fff' }}>{lapTime(selRow?.best)}</b>
                </span>
              </div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Select a driver to see live speed, gear, tyre and lap times. <span className="dim">Space = play/pause, ←/→ = ±10 s.</span>
            </p>
          )}
        </Card>

        <Card
          right={
            <Seg
              value={tab}
              onChange={setTab}
              options={[
                { value: 'control', label: 'Race control' },
                { value: 'radio', label: `Radio (${radios.length})` },
                ...(isRace ? [{ value: 'worm', label: 'Gaps' }] : []),
              ]}
            />
          }
        >
          {tab === 'control' && (
            <div className="feed">
              {messages.length === 0 && <span className="muted">No messages yet.</span>}
              {messages.map((m, i) => (
                <div key={i} className="feed-item" style={{ borderColor: flagColor(m.flag) }}>
                  <div className="t">
                    {clock(m.t - (isRace ? events.start || t0 : t0))}
                    {m.lap ? ` · L${m.lap}` : ''}
                  </div>
                  {m.msg}
                </div>
              ))}
            </div>
          )}
          {tab === 'radio' && (
            <div className="feed">
              {radios.length === 0 && <span className="muted">No team radio yet. Press play.</span>}
              {radios.map((r) => (
                <RadioItem key={r.src} r={r} d={meta.byCode[r.driver]} base={isRace ? events.start || t0 : t0} />
              ))}
            </div>
          )}
          {tab === 'worm' && isRace && <LiveWorm laps={laps} meta={meta} upTo={leaderDone} codes={tower.slice(0, 10).map((r) => r.code)} />}
        </Card>
      </div>

      <AnimatePresence>
        {popup && (
          <motion.div className="radio-pop" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 30 }}>
            <span className="team-bar" style={{ background: meta.byCode[popup.driver]?.color, height: 34 }} />
            <div>
              <div className="dim upper" style={{ fontSize: 10.5, fontWeight: 700 }}>
                Team radio
              </div>
              <b>{meta.byCode[popup.driver]?.last.toUpperCase()}</b>
            </div>
            <audio controls preload="none" src={asset(popup.src)} style={{ height: 32, width: 200 }} />
            <button className="btn icon" onClick={() => setPopup(null)} aria-label="Close">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function flagColor(flag) {
  if (!flag) return 'var(--line-2)'
  if (flag.includes('RED')) return '#e10600'
  if (flag.includes('YELLOW')) return '#ffd12e'
  if (flag.includes('GREEN') || flag === 'CLEAR') return '#00d26a'
  if (flag.includes('BLUE')) return '#2b7cff'
  if (flag.includes('CHEQUERED')) return '#fff'
  return 'var(--line-2)'
}

function RadioItem({ r, d, base }) {
  return (
    <div className="feed-item" style={{ borderColor: d?.color }}>
      <div className="t">
        {clock(r.t - base)} · <b style={{ color: '#fff' }}>{d ? d.last.toUpperCase() : r.driver}</b>
      </div>
      <audio controls preload="none" src={asset(r.src)} style={{ width: '100%', height: 30, marginTop: 4 }} />
    </div>
  )
}

function LiveWorm({ laps, meta, upTo, codes }) {
  const worm = useMemo(() => gapToLeader(laps), [laps])
  const series = codes.map((c) => ({
    id: c,
    color: meta.byCode[c].color,
    dash: meta.byCode[c].second,
    points: (worm[c] || []).filter((p) => p.x <= upTo && p.y < 120),
  }))
  if (upTo < 2) return <p className="muted">The gap chart fills in as laps are completed.</p>
  return (
    <LineChart
      series={series}
      height={260}
      invertY
      xDomain={[1, Math.max(2, upTo)]}
      xLabel="Lap"
      yLabel="Gap (s)"
      formatY={(v) => v.toFixed(0)}
      tooltipSort="asc"
      animate={false}
      margin={{ top: 10, right: 10, bottom: 32, left: 44 }}
    />
  )
}
