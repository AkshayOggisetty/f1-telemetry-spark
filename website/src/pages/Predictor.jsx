import { useMemo, useState } from 'react'
import { animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect } from 'react'
import * as d3 from 'd3'
import { Card, Page, PageHead, Ready, Reveal, Tyre, useMeta } from '../components/ui'
import { BarList, LineChart, useWidth } from '../components/charts'
import { sessionFile, useData } from '../lib/data'
import { compound, gap, lapTime } from '../lib/format'
import { features, predict, projectStint, treePredictions } from '../lib/rf'

const FEATURE_NAMES = {
  previous_lap_time: 'Previous lap time',
  tyre_life: 'Tyre life',
  stint: 'Stint',
  track_temp: 'Track temperature',
  lap: 'Lap number',
  compound_index: 'Tyre compound',
}

export default function Predictor() {
  const [meta, e1] = useMeta()
  const [data, e2] = useData('model.json', sessionFile('race', 'laps'))
  return (
    <Page>
      <PageHead kicker="Spark Random Forest · in your browser" title="Next-lap predictor">
        Set a car's current state and the Random Forest trained with Spark MLlib on the cluster predicts its next lap. All 80 trees were exported from
        Spark and run here, giving exactly the same predictions as the cluster.
      </PageHead>
      <Ready error={e1 || e2} ready={meta && data}>
        {() => <PredView meta={meta} model={data[0]} laps={data[1]} />}
      </Ready>
    </Page>
  )
}

function usePresets(laps) {
  return useMemo(() => {
    const out = []
    for (const [code, L] of Object.entries(laps)) {
      for (let i = 1; i < L.length - 1; i++) {
        const prev = L[i - 1]
        const cur = L[i]
        const next = L[i + 1]
        if (!prev.time || !cur.time || !next.time || cur.status !== '1' || cur.pitIn || cur.pitOut || next.pitIn) continue
        out.push({ code, lap: cur.lap, previousLap: cur.time, tyreLife: cur.tyre, stint: cur.stint, compound: cur.compound, trackTemp: cur.track ?? 30, actual: next.time })
      }
    }
    return out
  }, [laps])
}

function PredView({ meta, model, laps }) {
  const presets = usePresets(laps)
  const compounds = model.compoundLabels.filter((c) => c !== 'UNKNOWN')
  const start = presets.find((p) => p.code === 'VER' && p.lap === 30) || presets[0]
  const [input, setInput] = useState({ ...start })
  const [presetKey, setPresetKey] = useState(`${start.code}-${start.lap}`)
  const set = (k, v) => {
    setInput((s) => ({ ...s, [k]: v }))
    setPresetKey('')
  }

  const x = features(model, input)
  const votes = treePredictions(model, x)
  const pred = d3.mean(votes)
  const preset = presets.find((p) => `${p.code}-${p.lap}` === presetKey)

  const projections = useMemo(
    () =>
      compounds.map((c) => ({
        id: c,
        label: c,
        color: compound(c).color,
        width: c === input.compound ? 3 : 1.5,
        opacity: c === input.compound ? 1 : 0.45,
        points: projectStint(model, { ...input, compound: c }, 15).map((p) => ({ x: p.lap, y: p.time })),
      })),
    [model, input, compounds],
  )

  const tempSweep = useMemo(
    () => [
      {
        id: 'temp',
        label: 'Predicted',
        color: 'var(--red)',
        points: d3.range(22, 45.5, 0.5).map((tt) => ({ x: tt, y: predict(model, features(model, { ...input, trackTemp: tt })) })),
      },
    ],
    [model, input],
  )

  const driversWithPresets = [...new Set(presets.map((p) => p.code))].sort()

  return (
    <div className="pred-layout">
      <Card title="Car state">
        <div className="field">
          <label>Load a real race lap</label>
          <select
            value={presetKey}
            onChange={(e) => {
              const p = presets.find((q) => `${q.code}-${q.lap}` === e.target.value)
              if (p) {
                setInput({ ...p })
                setPresetKey(e.target.value)
              }
            }}
          >
            <option value="">Custom input…</option>
            {driversWithPresets.map((c) => (
              <optgroup key={c} label={`${c} · ${meta.byCode[c]?.last}`}>
                {presets
                  .filter((p) => p.code === c)
                  .map((p) => (
                    <option key={p.lap} value={`${p.code}-${p.lap}`}>
                      {c} after lap {p.lap} ({p.compound.toLowerCase()}, {p.tyreLife} laps old)
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Compound <b>{input.compound}</b></label>
          <div className="tyre-pick">
            {compounds.map((c) => (
              <button key={c} className={input.compound === c ? 'on' : ''} onClick={() => set('compound', c)} aria-label={c}>
                <Tyre c={c} size={40} />
              </button>
            ))}
          </div>
        </div>

        <Slider label="Previous lap" value={input.previousLap} min={102} max={118} step={0.05} fmt={lapTime} onChange={(v) => set('previousLap', v)} />
        <Slider label="Tyre life (laps)" value={input.tyreLife} min={1} max={45} step={1} onChange={(v) => set('tyreLife', v)} />
        <Slider label="Stint" value={input.stint} min={1} max={4} step={1} onChange={(v) => set('stint', v)} />
        <Slider label="Lap number" value={input.lap} min={1} max={51} step={1} onChange={(v) => set('lap', v)} />
        <Slider label="Track temp (°C)" value={input.trackTemp} min={22} max={45} step={0.5} fmt={(v) => v.toFixed(1)} onChange={(v) => set('trackTemp', v)} />
      </Card>

      <div className="grid" style={{ gap: 18 }}>
        <Card title="Prediction">
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, flexWrap: 'wrap' }}>
            <div>
              <div className="stat-label">Predicted next lap</div>
              <AnimatedTime value={pred} />
            </div>
            <div style={{ paddingBottom: 8 }}>
              <div className="stat-label">vs previous lap</div>
              <div className="mono" style={{ fontSize: 22, color: pred > input.previousLap ? 'var(--red-2)' : 'var(--green)' }}>{gap(pred - input.previousLap)}</div>
            </div>
            {preset && (
              <div style={{ paddingBottom: 8 }}>
                <div className="stat-label">Actual lap {preset.lap + 1}</div>
                <div className="mono" style={{ fontSize: 22 }}>
                  {lapTime(preset.actual)} <span className="muted" style={{ fontSize: 14 }}>error {gap(pred - preset.actual)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="muted" style={{ fontSize: 12.5, margin: '16px 0 6px' }}>
            The forest's 80 tree votes (spread = model uncertainty). Range {lapTime(d3.min(votes))} – {lapTime(d3.max(votes))}
          </div>
          <Votes votes={votes} mean={pred} />
        </Card>

        <Reveal>
          <Card title="Stint projection" note="Each prediction is fed back in as the next 'previous lap' while tyre life and lap count go up, for each compound. The thick line is your selected tyre.">
            <LineChart series={projections} height={260} xLabel="Lap" yLabel="Lap time" formatY={lapTime} />
          </Card>
        </Reveal>

        <div className="grid g-2">
          <Reveal>
            <Card title="What the model relies on" note="Spark feature importances (mean impurity decrease).">
              <BarList
                rows={model.features.map((f, i) => ({ label: FEATURE_NAMES[f], value: model.featureImportances[i] })).sort((a, b) => b.value - a.value)}
                format={(v) => `${(v * 100).toFixed(1)}%`}
              />
            </Card>
          </Reveal>
          <Reveal delay={0.05}>
            <Card
              title="Track temperature sensitivity"
              note="Same car state, sweeping only the track temperature. The jump above ~28 °C is learned from the data: only the hotter practice sessions reached those temperatures, so the forest links heat with practice-session pace. Track temperature acts partly as a session proxy, which is why it ranks as the top feature."
            >
              <LineChart series={tempSweep} height={200} xLabel="°C" yLabel="Lap" formatY={lapTime} formatX={(v) => v} />
            </Card>
          </Reveal>
        </div>

        <Card title="Model card">
          <div className="grid g-4" style={{ gap: 12, fontSize: 13 }}>
            <div><div className="stat-label">Algorithm</div>{model.model}</div>
            <div><div className="stat-label">Trees / depth</div>{model.numTrees} / {model.maxDepth}</div>
            <div><div className="stat-label">Train / test rows</div>{model.trainRows} / {model.testRows}</div>
            <div>
              <div className="stat-label">Test metrics</div>
              MAE {model.metrics.mae.toFixed(3)} s · RMSE {model.metrics.rmse.toFixed(3)} s · R² {model.metrics.r2.toFixed(3)}
            </div>
          </div>
          <p className="dim" style={{ fontSize: 12, marginBottom: 0 }}>
            Trained on clean green-flag push laps (no pit laps, accurate timing). Rows are ordered by session, driver and lap; the first 80% train the
            model and the last 20% (race laps of the drivers late in that order) test it. Predictions far outside the training range (e.g. a 118 s previous lap) are flattened, as with any tree model.
          </p>
        </Card>
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange, fmt = (v) => v }) {
  return (
    <div className="field">
      <label>
        {label} <b>{fmt(value)}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  )
}

function AnimatedTime({ value }) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => lapTime(v))
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.45, ease: [0.22, 1, 0.36, 1] })
    return c.stop
  }, [value, mv])
  return <motion.div className="big-time">{text}</motion.div>
}

function Votes({ votes, mean }) {
  const [ref, width] = useWidth()
  const h = 90
  const ext = d3.extent(votes)
  const pad = Math.max(0.2, (ext[1] - ext[0]) * 0.15)
  const x = d3.scaleLinear().domain([ext[0] - pad, ext[1] + pad]).range([10, width - 10])
  const bins = d3.bin().domain(x.domain()).thresholds(28)(votes)
  const y = d3.scaleLinear().domain([0, d3.max(bins, (b) => b.length)]).range([0, h - 24])
  return (
    <div ref={ref}>
      <svg className="chart" width={width} height={h}>
        {bins.map((b, i) => (
          <motion.rect
            key={i}
            x={x(b.x0) + 1}
            width={Math.max(1, x(b.x1) - x(b.x0) - 2)}
            fill="var(--red)"
            rx={2}
            animate={{ y: h - 18 - y(b.length), height: y(b.length) }}
            transition={{ duration: 0.35 }}
          />
        ))}
        <motion.line animate={{ x1: x(mean), x2: x(mean) }} y1={0} y2={h - 18} stroke="#fff" strokeWidth={2} strokeDasharray="3 3" transition={{ duration: 0.35 }} />
        {x.ticks(5).map((t) => (
          <text key={t} x={x(t)} y={h - 4} textAnchor="middle">
            {lapTime(t)}
          </text>
        ))}
      </svg>
    </div>
  )
}
