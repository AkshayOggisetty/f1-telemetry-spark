import { Card, Page, PageHead, Ready, Reveal, Stat, useMeta } from '../components/ui'

const STEPS = [
  { n: '01', title: 'Ingest', text: 'convert_to_csv.py pulls per-lap JSON from the TracingInsights/2025 GitHub repo and flattens it to telemetry.csv and laptimes.csv.' },
  { n: '02', title: 'HDFS', text: 'Raw CSVs uploaded to /bda/f1-telemetry/raw with replication factor 2 across the DataNodes.' },
  { n: '03', title: 'Clean', text: 'Spark DataFrames apply a fixed schema, drop invalid samples, clamp throttle, null bad gears and add acceleration magnitude.' },
  { n: '04', title: 'Features', text: 'Per-lap aggregates (speed, RPM, throttle, braking %, DRS %) joined with lap times, tyres, pit and weather data.' },
  { n: '05', title: 'Model', text: 'MLlib linear regression, Random Forest and K-Means, plus anomaly scoring and the chase graph.' },
  { n: '06', title: 'Serve', text: 'Parquet results exported to CSV/JSON for Power BI and turned into this website.' },
]

const JOBS = [
  ['f1_clean_v2.py', 'Telemetry cleaning → processed/cleaned_v2 (Parquet, 12 partitions)'],
  ['f1_lap_features_v2.py', 'Lap-level feature table → processed/lap_features'],
  ['f1_step5_tables.py', 'Fastest-lap telemetry, race positions and stints'],
  ['f1_tyre_degradation.py', 'Linear regression of lap time on tyre life per compound'],
  ['f1_next_lap_prediction_v2.py', 'Random Forest next-lap prediction (80 trees, depth 8)'],
  ['f1_kmeans_v2.py', 'Driver clustering, K picked by silhouette score'],
  ['f1_anomaly_detection_v2.py', 'K-Means distance anomaly detection (top 1% of laps)'],
  ['f1_chase_graph.py', 'Driver-chasing graph with DataFrames (edges, in/out degree)'],
  ['export_tables.py', 'CSV + JSON exports for Power BI'],
  ['f1_export_rf_model.py', 'Exports the trained forest as JSON for the predictor page'],
]

const NODES = [
  { role: 'Master', host: 'Predator', alias: 'master', ip: '100.x.x.x', services: ['NameNode', 'ResourceManager', 'DataNode', 'NodeManager', 'Spark History Server'], spec: 'Intel i5-13500HX · 20 threads · Ubuntu 24.04 (WSL2)' },
  { role: 'Worker 1', host: 'kowshikchakka', alias: 'worker1', ip: '100.x.x.x', services: ['DataNode', 'NodeManager'], spec: 'Connected over Tailscale' },
  { role: 'Worker 2', host: 'LAPTOP-0R1PU807', alias: 'worker2', ip: '100.x.x.x', services: ['DataNode', 'NodeManager'], spec: 'Connected over Tailscale' },
]

export default function Pipeline() {
  const [meta, err] = useMeta()
  return (
    <Page>
      <PageHead kicker="Hadoop 3.5.0 · Spark 4.0.4 · YARN" title="Big data pipeline">
        How {meta ? `${meta.dataset.telemetryMB} MB` : 'the'} of raw telemetry becomes the charts on this site: a three-node Hadoop cluster with Spark jobs
        submitted to YARN in client mode.
      </PageHead>
      <Ready error={err} ready={meta}>
        {() => (
          <div className="grid" style={{ gap: 18 }}>
            <div className="grid g-4">
              <Reveal><Stat label="Telemetry rows" value={meta.dataset.telemetryRows.toLocaleString()} sub={`${meta.dataset.telemetryMB} MB CSV`} /></Reveal>
              <Reveal delay={0.04}><Stat label="Lap rows" value={meta.dataset.lapRows.toLocaleString()} sub="5 sessions · 20 drivers" /></Reveal>
              <Reveal delay={0.08}><Stat label="HDFS capacity" value="2.95 TB" sub="3 DataNodes · replication 2" /></Reveal>
              <Reveal delay={0.12}><Stat label="YARN resources" value="24 GB" sub="24 vCores across 3 NodeManagers" /></Reveal>
            </div>

            <Reveal>
              <Card title="Data flow">
                <div className="flow">
                  {STEPS.map((s) => (
                    <div key={s.n} className="card flow-step">
                      <div className="n">STEP {s.n}</div>
                      <h3>{s.title}</h3>
                      <p>{s.text}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>

            <div className="grid g-3">
              {NODES.map((n, i) => (
                <Reveal key={n.host} delay={i * 0.05}>
                  <div className="card node-card" style={{ height: '100%' }}>
                    <span className={`badge ${i ? 'alt' : ''}`}>{n.role}</span>
                    <h3 style={{ margin: '10px 0 2px' }}>{n.host}</h3>
                    <div className="mono muted" style={{ fontSize: 12.5 }}>
                      {n.alias} · {n.ip}
                    </div>
                    <p className="muted" style={{ fontSize: 13 }}>{n.spec}</p>
                    <div className="chips">
                      {n.services.map((s) => (
                        <span key={s} className="chip" style={{ cursor: 'default', paddingLeft: 10 }}>{s}</span>
                      ))}
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>

            <div className="grid g-2">
              <Reveal>
                <Card title="Spark jobs" note="Each job is submitted with spark-submit --master yarn --deploy-mode client (3 executors × 2 cores × 2 GB).">
                  <ol className="code-list">
                    {JOBS.map(([file, text], i) => (
                      <li key={file}>
                        <span className="mono dim">{String(i + 1).padStart(2, '0')}</span>
                        <span>
                          <code>{file}</code>
                          <span className="muted" style={{ display: 'block', fontSize: 12.5, marginTop: 2 }}>{text}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                </Card>
              </Reveal>
              <Reveal delay={0.05}>
                <Card title="Spark components used">
                  <div style={{ display: 'grid', gap: 14 }}>
                    {[
                      ['Spark SQL / DataFrames', 'Schema-on-read CSV ingestion, filtering, window functions (lag/lead), joins, group-by aggregations and the chase graph.'],
                      ['Spark MLlib', 'StringIndexer, VectorAssembler, StandardScaler, LinearRegression, RandomForestRegressor, KMeans, ClusteringEvaluator and RegressionEvaluator.'],
                      ['HDFS + Parquet', 'Raw CSV and all intermediate / result tables stored in HDFS as Snappy Parquet.'],
                      ['YARN', 'Every job runs as a YARN application, visible in the ResourceManager UI (port 8088) and the Spark History Server (port 18080).'],
                    ].map(([h, t]) => (
                      <div key={h}>
                        <b className="upper" style={{ fontSize: 13 }}>{h}</b>
                        <p className="muted" style={{ margin: '2px 0 0', fontSize: 13 }}>{t}</p>
                      </div>
                    ))}
                  </div>
                </Card>
                <Card title="Dataset" style={{ marginTop: 18 }}>
                  <p className="muted" style={{ marginTop: 0, fontSize: 13.5 }}>
                    2025 Azerbaijan Grand Prix, all five sessions, from{' '}
                    <a href={meta.dataset.sourceUrl} target="_blank" rel="noreferrer" style={{ color: '#fff', borderBottom: '1px dotted' }}>
                      {meta.dataset.source}
                    </a>
                    , DOI{' '}
                    <a href={`https://doi.org/${meta.dataset.doi}`} target="_blank" rel="noreferrer" style={{ color: '#fff', borderBottom: '1px dotted' }}>
                      {meta.dataset.doi}
                    </a>
                    . Telemetry has 22 columns per sample (speed, RPM, gear, throttle, brake, DRS, distance, x/y/z position, 3-axis acceleration and
                    driver-ahead gap); lap times have 45 columns including sectors, tyres, pit times and weather.
                  </p>
                </Card>
              </Reveal>
            </div>
          </div>
        )}
      </Ready>
    </Page>
  )
}
