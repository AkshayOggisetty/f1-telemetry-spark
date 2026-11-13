import { Link } from 'react-router-dom'
import { Page, Ready, Reveal, Stat, Tyre, useMeta, useSession } from '../components/ui'
import { TrackMap } from '../components/TrackMap'
import { asset, useData } from '../lib/data'
import { lapTime } from '../lib/format'

const FEATURES = [
  { to: '/replay', title: 'Live Replay', text: 'Every car on the Baku map, a live timing tower, flags, race control and team radio.', icon: 'M5 12h14M12 5l7 7-7 7' },
  { to: '/race', title: 'Race Analysis', text: 'The worm (gap to leader), race trace, position changes and tyre strategy.', icon: 'M3 17l6-6 4 4 8-8' },
  { to: '/telemetry', title: 'Telemetry', text: 'Fastest-lap speed, throttle, brake and gear traces with a track-dominance map.', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { to: '/laptimes', title: 'Lap Times', text: 'Every lap of every session, by compound and tyre age, with best sectors.', icon: 'M12 7v5l3 3M12 3a9 9 0 100 18 9 9 0 000-18z' },
  { to: '/insights', title: 'Spark ML Insights', text: 'Tyre degradation, K-Means clusters, anomaly detection and the chase graph.', icon: 'M4 19V9M10 19V5M16 19v-7M22 19H2' },
  { to: '/predictor', title: 'Lap Predictor', text: 'Your inputs, run through the Spark Random Forest live in the browser.', icon: 'M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z' },
]

export default function Home() {
  const [meta, err1] = useMeta()
  const [data, err2] = useData('sessions/race/results.json')
  const [, setSession] = useSession()

  return (
    <Page>
      <Ready error={err1 || err2} ready={meta && data}>
        {() => {
          const results = data[0].classification
          const winner = meta.byCode[results[0].code]
          const race = meta.sessions.find((s) => s.slug === 'race')
          const podium = [results[1], results[0], results[2]]
          return (
            <>
              <section className="hero">
                <div className="hero-stripes" />
                <div style={{ position: 'relative' }}>
                  <div className="kicker">Round {meta.event.round} · {meta.event.dates}</div>
                  <h1>
                    Azerbaijan <span>Grand Prix</span> 2025
                  </h1>
                  <p>
                    {meta.dataset.telemetryRows.toLocaleString()} telemetry samples ({meta.dataset.telemetryMB} MB) from all five sessions on the
                    Baku City Circuit, processed with Apache Spark on a Hadoop YARN cluster.
                  </p>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link to="/replay" className="btn primary" onClick={() => setSession('race')}>
                      ▶ Watch race replay
                    </Link>
                    <Link to="/race" className="btn">
                      Race analysis
                    </Link>
                  </div>
                </div>
                <div className="hero-track">
                  <TrackMap circuit={meta.circuit} color="#e10600" width={16} draw showCorners={false} style={{ maxHeight: 320 }} />
                </div>
              </section>

              <div className="grid g-4" style={{ marginTop: 18 }}>
                <Reveal><Stat label="Winner" value={winner.last} sub={`${winner.team} · ${lapTime(results[0].raceTime)}`} color={winner.color} /></Reveal>
                <Reveal delay={0.05}><Stat label="Fastest lap" value={lapTime(race.fastest.time)} sub={`${race.fastest.driver} · lap ${race.fastest.lap}`} color="var(--purple)" /></Reveal>
                <Reveal delay={0.1}><Stat label="Race laps" value={race.maxLap} sub={`${meta.circuit.name} · ${meta.circuit.location}`} /></Reveal>
                <Reveal delay={0.15}><Stat label="Laps analysed" value={meta.dataset.lapRows.toLocaleString()} sub="across FP1, FP2, FP3, Qualifying and Race" /></Reveal>
              </div>

              <div className="grid g-2" style={{ marginTop: 18 }}>
                <Reveal>
                  <div className="card">
                    <div className="card-head">
                      <div className="card-title">Race podium</div>
                      <Link to="/race" className="muted" style={{ fontSize: 13 }}>Full classification →</Link>
                    </div>
                    <div className="podium">
                      {podium.map((r) => {
                        const d = meta.byCode[r.code]
                        const height = r.pos === 1 ? 92 : r.pos === 2 ? 70 : 56
                        return (
                          <div className="podium-step" key={r.code}>
                            <img className="podium-photo" src={asset(d.photo)} alt={`${d.first} ${d.last}`} loading="lazy" />
                            <div className="podium-block" style={{ background: d.color, height }}>
                              <div className="p">P{r.pos}</div>
                              <div style={{ fontSize: 13 }}>{d.last.toUpperCase()}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </Reveal>
                <Reveal delay={0.08}>
                  <div className="card" style={{ height: '100%' }}>
                    <div className="card-head">
                      <div className="card-title">Sessions</div>
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                      {meta.sessions.map((s) => {
                        const d = meta.byCode[s.fastest.driver]
                        return (
                          <Link
                            key={s.slug}
                            to="/replay"
                            onClick={() => setSession(s.slug)}
                            className="card session-card"
                            style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '64px 1fr auto', alignItems: 'center', gap: 12 }}
                          >
                            <span className="tag">{s.short}</span>
                            <span>
                              <b className="upper">{s.name}</b>
                              <span className="muted" style={{ display: 'block', fontSize: 12.5 }}>
                                {s.laps} laps · Air {s.airTemp}°C · Track {s.trackTemp}°C
                              </span>
                            </span>
                            <span className="mono" style={{ textAlign: 'right' }}>
                              <span style={{ color: 'var(--purple)' }}>{lapTime(s.fastest.time)}</span>
                              <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                                <span className="team-bar" style={{ background: d.color, height: 10 }} />
                                {d.code}
                              </span>
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </Reveal>
              </div>

              <div className="kicker" style={{ margin: '34px 0 14px' }}>Explore</div>
              <div className="grid g-3">
                {FEATURES.map((f, i) => (
                  <Reveal key={f.to} delay={i * 0.04}>
                    <Link to={f.to} className="card feature-link">
                      <span className="ico">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d={f.icon} />
                        </svg>
                      </span>
                      <span>
                        <h3>{f.title}</h3>
                        <p>{f.text}</p>
                      </span>
                    </Link>
                  </Reveal>
                ))}
              </div>

              <Reveal>
                <div className="card" style={{ marginTop: 18 }}>
                  <div className="card-head">
                    <div className="card-title">Teams on the grid</div>
                  </div>
                  <div className="grid g-4" style={{ gap: 12 }}>
                    {meta.teams.map((t) => {
                      const pair = meta.drivers.filter((d) => d.team === t.name)
                      return (
                        <div key={t.slug} style={{ borderLeft: `4px solid ${t.color}`, paddingLeft: 12 }}>
                          <b className="upper" style={{ fontSize: 13 }}>{t.name}</b>
                          {t.car && <img src={asset(t.car)} alt={`${t.name} car`} loading="lazy" style={{ margin: '6px 0', height: 46, objectFit: 'contain' }} />}
                          <div className="muted" style={{ fontSize: 12.5 }}>
                            {pair.map((d) => `${d.first[0]}. ${d.last}`).join(' · ')}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </Reveal>

              <p className="dim" style={{ fontSize: 12.5, marginTop: 18 }}>
                Compounds: <Tyre c="SOFT" size={16} /> Soft · <Tyre c="MEDIUM" size={16} /> Medium · <Tyre c="HARD" size={16} /> Hard
              </p>
            </>
          )
        }}
      </Ready>
    </Page>
  )
}
