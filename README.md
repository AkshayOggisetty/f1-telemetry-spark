# F1 Telemetry Analytics: Apache Spark on a Hadoop/YARN Cluster

An end-to-end big data pipeline for the **2025 Azerbaijan Grand Prix**: 3.09 million telemetry
records (656 MB) and 2,439 laps across all five sessions, stored in HDFS on a three-node Hadoop
cluster and processed by PySpark jobs running on YARN. The results feed an F1-styled React
website with a session replay, race analysis and an in-browser lap-time predictor.

**Headline result:** a Spark MLlib random forest predicts the next race lap with a mean absolute
error of **0.535 s** (R² = 0.633) on held-out laps.

## Pipeline

```
telemetry.csv + laptimes.csv  ->  HDFS  ->  Spark on YARN
   ├─ telemetry cleaning                 (Spark DataFrames)
   ├─ lap feature engineering
   ├─ fastest laps / race positions / stints
   ├─ tyre degradation                   (MLlib linear regression)
   ├─ next-lap time prediction           (MLlib random forest)
   ├─ driver style clustering            (MLlib K-Means)
   ├─ telemetry anomaly detection        (distance to K-Means centroids)
   └─ driver "chase" graph               (gap-to-car-ahead channel)
        ->  CSV / JSON / Parquet exports  ->  website
```

## Cluster

| Node | Role |
|---|---|
| master | NameNode, ResourceManager, DataNode, NodeManager, Spark History Server |
| worker1 | DataNode, NodeManager |
| worker2 | DataNode, NodeManager |

Hadoop 3.5.0 · Spark 4.0.4 · Java 17 · Python 3.12 · HDFS replication 2 · machines joined over a
Tailscale private network. Every job runs with `--master yarn --deploy-mode client`.

## Repository layout

| Path | Contents |
|---|---|
| `code/` | PySpark jobs (cleaning, features, MLlib models, graph, exports, RF export for the website) |
| `commands/run_commands.sh` | Runs the whole pipeline on YARN in order |
| `website/` | React + Vite site: replay, race trace and worm chart, telemetry comparison, insights, predictor |
| `report/` | IEEE-style project report (Markdown source, figures, docx build script) |

## Run

```bash
# on the cluster master, with the raw CSVs in HDFS
bash commands/run_commands.sh

# website
cd website && npm install && npm run dev   # http://localhost:5173
```

The trained random forest (80 trees) is exported to JSON by `code/f1_export_rf_model.py` and
evaluated in the browser; its predictions match Spark's exactly.

## Data

Telemetry and timing data from [TracingInsights/2025](https://github.com/TracingInsights/2025)
(Apache-2.0, DOI [10.5281/zenodo.17312803](https://doi.org/10.5281/zenodo.17312803)). The raw
CSVs are not included here because of their size; the website ships the processed outputs in
`website/public/data`.

## Author

Sai Akshay Oggisetty · B.Tech Data Science and Engineering, Manipal Institute of Technology
