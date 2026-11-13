from pyspark.sql import SparkSession

spark = SparkSession.builder.appName("F1-Final-Exports").getOrCreate()

BASE = "hdfs:///bda/f1-telemetry"
OUT = BASE + "/final_exports"

tables = {
    "fastest_laps": BASE + "/analysis_v2/fastest_laps",
    "race_position": BASE + "/analysis_v2/race_position",
    "stints": BASE + "/analysis_v2/stints",
    "tyre_degradation": BASE + "/analysis_v2/tyre_degradation",
    "next_lap_predictions": BASE + "/analysis_v2/next_lap_prediction/predictions",
    "next_lap_metrics": BASE + "/analysis_v2/next_lap_prediction/session_metrics",
    "driver_clusters": BASE + "/analysis_v2/driver_clusters",
    "telemetry_anomalies": BASE + "/analysis_v2/telemetry_anomalies",
    "chase_edges": BASE + "/analysis_v2/chase_graph/edges",
    "chase_vertices": BASE + "/analysis_v2/chase_graph/vertices",
    "chase_in_degree": BASE + "/analysis_v2/chase_graph/in_degree",
    "chase_out_degree": BASE + "/analysis_v2/chase_graph/out_degree"
}

print("\n==============================")
print("FINAL CSV + JSON EXPORT")
print("==============================")

for name, path in tables.items():

    print("\nExporting:", name)

    df = spark.read.parquet(path)

    # CSV
    csv_path = OUT + "/csv/" + name
    df.coalesce(1) \
      .write \
      .mode("overwrite") \
      .option("header", True) \
      .csv(csv_path)

    # JSON
    json_path = OUT + "/json/" + name
    df.coalesce(1) \
      .write \
      .mode("overwrite") \
      .json(json_path)

    print("Rows:", df.count())
    print("CSV:", csv_path)
    print("JSON:", json_path)

print("\n==============================")
print("EXPORT COMPLETE")
print("==============================")
print("Output:", OUT)

spark.stop()
