import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMeta } from '../components/ui'
import '../present.css'

// Slide images are bundled so the offline export (scripts/export_present.py) can find them.
const IMG = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/present/*.png', { eager: true, query: '?url', import: 'default' })).map(([k, v]) => [
    k.split('/').pop(),
    v,
  ]),
)

function DemoLinks() {
  return (
    <div className="links">
      <Link to="/replay">Open replay →</Link>
      <Link to="/predictor">Open predictor →</Link>
    </div>
  )
}

/* ---------- building blocks ---------- */

function Slide({ tag, children, className = '' }) {
  return (
    <section className={`slide ${className}`}>
      <div className="stage">
        {tag && <div className="ptag">{tag}</div>}
        {children}
      </div>
    </section>
  )
}

/** A pit-board style question with its short answer. */
function QA({ k = 'WHY', q, children }) {
  return (
    <div className="qa">
      <span className="qa-k">{k}?</span>
      <div>
        <b>{q}</b>
        <p>{children}</p>
      </div>
    </div>
  )
}

function Fig({ src, alt, cap }) {
  return (
    <figure className="pfig">
      <img src={IMG[src]} alt={alt} loading="lazy" />
      {cap && <figcaption>{cap}</figcaption>}
    </figure>
  )
}

const Big = ({ v, l }) => (
  <div className="pbig">
    <b>{v}</b>
    <span>{l}</span>
  </div>
)

/* ---------- the deck ---------- */

const SLIDES = [
  // 1 · title
  () => (
    <Slide tag="DSE 3125 · Big Data Analytics · Mini Project" className="title">
      <h1>
        Lights out on <em>3 million</em>
        <br />
        rows of telemetry
      </h1>
      <p className="lead">2025 Azerbaijan Grand Prix · Apache Spark on a 3-node Hadoop cluster</p>
      <div className="grid-crew">
        {[
          ['Sai Akshay Oggisetty', 'MIT Manipal'],
        ].map(([n, r]) => (
          <div key={n}>
            <b>{n}</b>
            <span>{r}</span>
          </div>
        ))}
      </div>
      <p className="hint">Press F for full screen · arrows to move</p>
    </Slide>
  ),

  // 2 · questions
  () => (
    <Slide tag="Race brief · What we asked">
      <h2>Five questions for <em>one race weekend</em></h2>
      {[
        ['How fast does each tyre compound', 'lose time?'],
        ['Can we predict the', 'next lap time?'],
        ['Which drivers', 'drive alike?'],
        ['Which laps look', 'wrong?'],
        ['Who spent the race', 'chasing whom?'],
      ].map(([a, b], i) => (
        <div className="pq" key={i}>
          <span>Q{i + 1}</span>
          {a} <em>{b}</em>
        </div>
      ))}
    </Slide>
  ),

  // 3 · why big data
  () => (
    <Slide tag="Why big data">
      <h2>One weekend is already <em>too big for one laptop</em></h2>
      <div className="grid4">
        <Big v="3,092,689" l="telemetry rows" />
        <Big v="656 MB" l="as CSV" />
        <Big v="5" l="sessions · FP1–FP3, Quali, Race" />
        <Big v="20" l="drivers, sampled several times a second" />
      </div>
      <QA q="Why not just pandas?">
        Joining 3 M samples with laps, aggregating and training models is memory-bound on one machine. Spark splits it across nodes; the same code
        scales to a full season (~75 M rows).
      </QA>
    </Slide>
  ),

  // 4 · dataset
  () => (
    <Slide tag="The data">
      <div className="row">
        <div>
          <h2>
            TracingInsights<em>/2025</em>
          </h2>
          <p>
            Public GitHub archive of the 2025 season, <b>Apache-2.0</b>, DOI 10.5281/zenodo.17312803. One JSON file per lap per driver, flattened to
            two CSVs.
          </p>
          <QA k="HOW" q="How did we get it in?">
            A script pulls every file with 16 parallel downloads, writes telemetry.csv and laptimes.csv, then <code>hdfs dfs -put</code>.
          </QA>
        </div>
        <div className="cards">
          <div className="pcard">
            <h3>telemetry.csv</h3>
            <p>22 columns · speed, RPM, gear, throttle, brake, DRS, distance, x/y/z, acceleration, car ahead + gap</p>
          </div>
          <div className="pcard">
            <h3>laptimes.csv</h3>
            <p>2,439 laps · 45 columns · lap & sector times, compound, tyre life, stint, pit times, weather</p>
          </div>
        </div>
      </div>
    </Slide>
  ),

  // 5 · cluster
  () => (
    <Slide tag="The garage · Cluster">
      <h2>
        Three laptops, <em>one cluster</em>
      </h2>
      <div className="grid3">
        <div className="pcard red">
          <h3>Master · Predator</h3>
          <p>NameNode, ResourceManager, DataNode, NodeManager · i5-13500HX, WSL2 Ubuntu 24.04</p>
        </div>
        <div className="pcard">
          <h3>worker1 · kowshikchakka</h3>
          <p>DataNode, NodeManager</p>
        </div>
        <div className="pcard">
          <h3>worker2 · LAPTOP-0R1PU807</h3>
          <p>DataNode, NodeManager</p>
        </div>
      </div>
      <p className="specs mono">Hadoop 3.5.0 · Spark 4.0.4 · Java 17 · HDFS 2.95 TB, replication 2 · YARN 24 GB / 24 vCores · 3 executors × 2 cores × 2 GB</p>
      <div className="grid2">
        <QA q="Why Tailscale?">Our laptops sit on different networks. A private VPN gives every node a fixed address, so HDFS and YARN can find each other.</QA>
        <QA q="Why replication 2?">With 3 DataNodes, two copies survive one laptop going offline without tripling the storage.</QA>
      </div>
    </Slide>
  ),

  // 6 · pipeline
  () => (
    <Slide tag="Strategy · Pipeline">
      <div className="row">
        <div>
          <h2>
            Every step is a <em>Spark job on YARN</em>
          </h2>
          <p>Raw CSV in HDFS → ten PySpark applications in client mode → Parquet back in HDFS → CSV/JSON for the dashboards.</p>
          <QA k="HOW" q="Which Spark parts?">
            <b>DataFrames / SQL</b> for cleaning, joins, windows and the graph. <b>MLlib</b> for linear regression, random forest and K-Means.
          </QA>
          <QA q="Why stage the Spark jars in HDFS?">YARN would otherwise upload the Spark libraries for every single job.</QA>
        </div>
        <Fig src="fig_architecture.png" alt="Pipeline architecture" />
      </div>
    </Slide>
  ),

  // 7 · proof
  () => (
    <Slide tag="Telemetry check · It really runs distributed" className="shotslide">
      <h2>
        HDFS and YARN <em>on all three nodes</em>
      </h2>
      <div className="shots">
        <Fig src="crop_hdfs_datanodes.png" alt="HDFS DataNodes" cap="HDFS · 3 DataNodes in service" />
        <Fig src="crop_yarn_nodes.png" alt="YARN nodes" cap="YARN · 3 running NodeManagers, 24 GB / 24 vCores" />
      </div>
    </Slide>
  ),

  // 7b · proof, Spark side
  () => (
    <Slide tag="Telemetry check · Jobs on YARN" className="shotslide">
      <h2>
        Spark jobs <em>scheduled by YARN</em>
      </h2>
      <div className="shots">
        <Fig src="crop_yarn_applications.png" alt="YARN applications" cap="YARN · Spark application running in the default queue" />
        <Fig src="crop_spark_executors.png" alt="Spark executors" cap="Spark UI · driver on master, executors on master, worker1, worker2" />
      </div>
      <QA k="HOW" q="How do we know it is not local mode?">
        Every job is submitted with <code>--master yarn</code>; YARN lists it as an application and places executors on all three nodes.
      </QA>
    </Slide>
  ),

  // 8 · cleaning
  () => (
    <Slide tag="Scrutineering · Cleaning">
      <h2>
        3.09 M in, <em>2.27 M</em> out
      </h2>
      <div className="funnel">
        <div style={{ '--w': '100%' }}>
          <span>Raw samples</span>
          <b>3,092,689</b>
        </div>
        <div style={{ '--w': '73.5%' }}>
          <span>Clean samples (73.5 %)</span>
          <b>2,273,155</b>
        </div>
      </div>
      <p>
        Dropped: stationary cars (&lt; 5 km/h), lap 0, missing position, invalid brake/DRS. Clamped <b>569,305</b> throttle values to 0–100 %, nulled{' '}
        <b>3,282</b> impossible gears.
      </p>
      <div className="grid2">
        <QA q="Why an explicit schema?">Schema inference would read the 656 MB file twice and can guess wrong types.</QA>
        <QA q="Why 12 Parquet partitions?">3 executors × 2 cores = 6 tasks at a time; 12 parts keep every core busy for two rounds.</QA>
      </div>
    </Slide>
  ),

  // 9 · lap features
  () => (
    <Slide tag="Setup · Lap features">
      <h2>
        Samples become <em>laps</em>
      </h2>
      <p className="lead">
        <code>groupBy(session, driver, lap)</code> → speed, RPM, throttle, braking %, DRS %, acceleration · joined with lap times, tyres and weather.
      </p>
      <div className="grid3">
        <Big v="2,433" l="laps" />
        <Big v="1,156" l="push laps" />
        <Big v="653" l="pit laps" />
      </div>
      <QA q="Why only push laps for models?">
        In/out laps, Safety Car and inaccurate laps are not about pace. A push lap is accurate, green-flag and not a pit lap.
      </QA>
    </Slide>
  ),

  // 10 · tyres
  () => (
    <Slide tag="Q1 · Tyre degradation">
      <div className="row">
        <div>
          <h2>
            Soft fades, <em>fuel hides the rest</em>
          </h2>
          <p>
            MLlib linear regression per compound: <code>lap_time ~ tyre_life + lap</code>.
          </p>
          <table className="ptable">
            <thead>
              <tr>
                <th>Compound</th>
                <th>s / lap of age</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Soft</td>
                <td className="hot">+0.396</td>
              </tr>
              <tr>
                <td>Medium</td>
                <td>−0.041</td>
              </tr>
              <tr>
                <td>Hard</td>
                <td>+0.002</td>
              </tr>
            </tbody>
          </table>
          <QA q="Why do old tyres look faster?">The car burns fuel every lap and gets lighter, which cancels out the wear.</QA>
        </div>
        <Fig src="fig_tyre_race.png" alt="Race lap time against tyre life" cap="Race push laps vs tyre life" />
      </div>
    </Slide>
  ),

  // 11 · prediction
  () => (
    <Slide tag="Q2 · Next-lap prediction">
      <div className="row">
        <div>
          <h2>
            Within <em>half a second</em>
          </h2>
          <div className="grid3 tight">
            <Big v="0.535 s" l="MAE" />
            <Big v="0.648 s" l="RMSE" />
            <Big v="0.633" l="R²" />
          </div>
          <p>Random forest, 80 trees, depth 8 · features from lag/lead windows · 772 train / 193 test laps.</p>
          <QA q="Why a random forest?">Handles non-linear effects, needs no scaling, and tells us which inputs matter.</QA>
          <QA q="Why is track temp on top?">Above 28.4 °C only happens in practice, so it secretly tells the model which session it is.</QA>
        </div>
        <Fig src="fig_prediction.png" alt="Predicted vs actual and feature importance" cap="(a) predicted vs actual · (b) importance" />
      </div>
    </Slide>
  ),

  // 12 · clusters
  () => (
    <Slide tag="Q3 · Driving styles">
      <div className="row">
        <div>
          <h2>
            Five <em>driving styles</em>
          </h2>
          <p>K-Means on 7 averaged features, K = 2…5, best silhouette → K = 5.</p>
          <ul className="plist">
            <li>
              <b>HAM, LEC, BOR, OCO</b> · brake the most (24 %)
            </li>
            <li>
              <b>VER, RUS, SAI</b> · least DRS: clean air at the front
            </li>
            <li>
              <b>PIA</b> · alone: crashed on lap 1, mostly practice data
            </li>
          </ul>
          <QA q="Why standardise first?">RPM is in thousands, braking is a fraction; without scaling RPM would decide every cluster.</QA>
        </div>
        <Fig src="fig_clusters.png" alt="Driver clusters" cap="Braking share vs mean lap speed" />
      </div>
    </Slide>
  ),

  // 13 · anomalies
  () => (
    <Slide tag="Q4 · Anomalous laps">
      <div className="row">
        <div>
          <h2>
            25 laps <em>flagged</em>
          </h2>
          <p>K-Means on all laps; score = distance to the nearest centroid; top 1 % flagged.</p>
          <ul className="plist">
            <li>
              <b>HAD · FP1 lap 6</b> · crawling at 25 km/h
            </li>
            <li>
              <b>ANT · FP2 lap 22</b> · braking on 73 % of samples
            </li>
            <li>
              <b>ALB · Quali lap 4</b> · aborted lap
            </li>
          </ul>
          <QA q="Why unsupervised?">Nobody labels “weird laps”. Distance from normal finds them without labels.</QA>
        </div>
        <Fig src="fig_anomalies.png" alt="Anomalous laps" cap="Flagged laps in red" />
      </div>
    </Slide>
  ),

  // 14 · chase graph
  () => (
    <Slide tag="Q5 · Chase graph">
      <h2>
        Who was <em>stuck behind whom</em>
      </h2>
      <p className="lead">
        Every sample with a car &lt; 50 m ahead becomes an edge <b>chaser → car ahead</b>: 320,530 samples → 20 drivers, 380 edges.
      </p>
      <div className="grid2">
        <table className="ptable">
          <thead>
            <tr>
              <th>Chaser → ahead</th>
              <th>Samples</th>
              <th>Time &lt; 50 m</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['HUL → STR', '19,185', '122 s'],
              ['NOR → TSU', '9,877', '194 s'],
              ['NOR → LEC', '8,997', '129 s'],
              ['ANT → LAW', '7,312', '250 s'],
            ].map((r) => (
              <tr key={r[0]}>
                {r.map((c) => (
                  <td key={c}>{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div>
          <QA k="WHO" q="Most attacking? Most defending?">
            Hülkenberg chased the most; Stroll had a car on his gearbox the most.
          </QA>
          <QA q="Why not GraphFrames?">It needs an extra package on every node; plain DataFrame joins and group-bys build the same graph.</QA>
        </div>
      </div>
    </Slide>
  ),

  // 15 · website
  () => (
    <Slide tag="On track · Dashboard">
      <h2>
        Results you can <em>drive through</em>
      </h2>
      <div className="grid4">
        {[
          ['Live replay', 'Every car on the Baku map with a timing tower, flags and team radio'],
          ['Race analysis', 'Gap-to-leader “worm”, race trace, positions, tyre strategy'],
          ['Telemetry', 'Fastest-lap speed, throttle, brake and gear traces, track dominance'],
          ['Predictor', 'Set tyres and lap, the Spark forest predicts the next lap'],
        ].map(([h, p]) => (
          <div className="pcard" key={h}>
            <h3>{h}</h3>
            <p>{p}</p>
          </div>
        ))}
      </div>
      <QA k="HOW" q="How does a browser run a Spark model?">
        We saved the forest to HDFS and parsed every tree from <code>toDebugString</code> into JSON. The browser walks the same 80 trees; its
        predictions match Spark exactly.
      </QA>
      <DemoLinks />
    </Slide>
  ),

  // 16 · challenges
  () => (
    <Slide tag="Incidents · Challenges & limits">
      <h2>
        What <em>fought back</em>
      </h2>
      <div className="grid2">
        <div className="pcard">
          <h3>Challenges</h3>
          <ul className="plist">
            <li>Master in WSL2 with only 7.6 GB RAM</li>
            <li>Nodes are personal laptops that go offline</li>
            <li>Cross-network setup over a VPN</li>
          </ul>
        </div>
        <div className="pcard">
          <h3>Limitations</h3>
          <ul className="plist">
            <li>One event only: Baku-specific results</li>
            <li>Train/test split by row order, not time</li>
            <li>Track temperature leaks the session</li>
            <li>Only 20 points to cluster</li>
          </ul>
        </div>
      </div>
    </Slide>
  ),

  // 17 · conclusion
  () => (
    <Slide tag="Chequered flag · Conclusion">
      <h2>
        What we <em>take home</em>
      </h2>
      <ul className="plist big">
        <li>A working 3-node HDFS + YARN cluster running 10 Spark jobs end to end</li>
        <li>Soft tyres lose ~0.4 s a lap; fuel burn masks medium/hard wear</li>
        <li>Next lap predicted to ±0.535 s</li>
        <li>Styles split by braking and DRS; anomalies and chases found automatically</li>
      </ul>
      <h3 className="next">Next lap</h3>
      <p>Full 2025 season (~75 M rows) · Structured Streaming on live timing · fuel-corrected tyre models · GraphFrames PageRank on chases</p>
    </Slide>
  ),

  // 18 · thanks
  () => (
    <Slide className="title end">
      <h1>
        Thank <em>you</em>
      </h1>
      <p className="lead">Questions?</p>
      <p className="hint">Data: TracingInsights/2025 (Apache-2.0) · Not affiliated with Formula 1</p>
    </Slide>
  ),
]

/* ---------- mini track progress: a car lapping Baku as you scroll ---------- */

function TrackProgress({ circuit, p }) {
  const ref = useRef(null)
  const [pt, setPt] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const L = el.getTotalLength()
    const q = el.getPointAtLength(L * Math.min(0.999, p))
    setPt([q.x, q.y])
  }, [p, circuit])
  if (!circuit) return null
  const [x0, y0, x1, y1] = circuit.bounds
  const pad = 120
  const d = 'M' + circuit.outline.map((v) => v.join(',')).join('L') + 'Z'
  return (
    <svg className="mini-track" viewBox={`${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}`} aria-hidden="true">
      <path ref={ref} d={d} fill="none" stroke="rgba(255,255,255,.35)" strokeWidth="70" strokeLinejoin="round" />
      {pt && <circle cx={pt[0]} cy={pt[1]} r="110" fill="#e10600" stroke="#fff" strokeWidth="30" />}
    </svg>
  )
}

export default function Present() {
  const deck = useRef(null)
  const [meta] = useMeta()
  const [idx, setIdx] = useState(0)
  const [prog, setProg] = useState(0)
  const [fs, setFs] = useState(false)
  const N = SLIDES.length

  // scale the 1600×900 stage to the window
  useEffect(() => {
    const fit = () => deck.current?.style.setProperty('--s', Math.min(innerWidth / 1600, innerHeight / 900))
    const onFs = () => {
      setFs(document.fullscreenElement === deck.current)
      fit()
    }
    fit()
    addEventListener('resize', fit)
    document.addEventListener('fullscreenchange', onFs)
    document.body.style.overflow = 'hidden'
    return () => {
      removeEventListener('resize', fit)
      document.removeEventListener('fullscreenchange', onFs)
      document.body.style.overflow = ''
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  }, [])

  // fade slides in, track position
  useEffect(() => {
    const root = deck.current
    const secs = [...root.querySelectorAll('.slide')]
    const io = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('in', e.isIntersecting)), { root, threshold: 0.45 })
    secs.forEach((s) => io.observe(s))
    const onScroll = () => {
      const h = root.clientHeight
      setIdx(Math.min(N - 1, Math.round(root.scrollTop / h)))
      setProg(root.scrollTop / Math.max(1, root.scrollHeight - h))
    }
    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      io.disconnect()
      root.removeEventListener('scroll', onScroll)
    }
  }, [N])

  // keyboard + click navigation
  useEffect(() => {
    const root = deck.current
    const cur = () => Math.round(root.scrollTop / root.clientHeight)
    const go = (k) => root.scrollTo({ top: Math.max(0, Math.min(N - 1, k)) * root.clientHeight, behavior: 'smooth' })
    const onKey = (e) => {
      if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) {
        e.preventDefault()
        go(cur() + 1)
      } else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) {
        e.preventDefault()
        go(cur() - 1)
      } else if (e.key === 'Home') go(0)
      else if (e.key === 'End') go(N - 1)
      else if (e.key === 'f' || e.key === 'F') {
        document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen()
      }
    }
    const onClick = (e) => {
      if (document.fullscreenElement !== root || e.target.closest('a,button')) return
      e.clientX < innerWidth * 0.25 ? go(cur() - 1) : go(cur() + 1)
    }
    addEventListener('keydown', onKey)
    root.addEventListener('click', onClick)
    return () => {
      removeEventListener('keydown', onKey)
      root.removeEventListener('click', onClick)
    }
  }, [N])

  const toggleFs = () => (document.fullscreenElement ? document.exitFullscreen() : deck.current.requestFullscreen())

  return (
    <div className={`deck ${fs ? 'fs' : ''}`} ref={deck}>
      <div className="deck-bg" aria-hidden="true" />
      {!fs && (
        <div className="deck-top">
          <Link to="/" className="deck-btn">
            ← Back to site
          </Link>
          <button className="deck-btn red" onClick={toggleFs}>
            Full screen (F)
          </button>
        </div>
      )}
      {SLIDES.map((S, i) => (
        <S key={i} />
      ))}
      <div className="deck-hud">
        <div className="deck-bar">
          <i style={{ width: `${prog * 100}%` }} />
        </div>
        <span className="mono">
          LAP {String(idx + 1).padStart(2, '0')}/{N}
        </span>
        <TrackProgress circuit={meta?.circuit} p={prog} />
      </div>
    </div>
  )
}
