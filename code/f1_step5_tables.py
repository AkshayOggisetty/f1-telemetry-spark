from pyspark.sql import SparkSession
from pyspark.sql.functions import (
    col, min, max, first, count, row_number
)
from pyspark.sql.window import Window

spark = SparkSession.builder.appName("F1-Step5-Tables").getOrCreate()

telemetry_path = "hdfs:///bda/f1-telemetry/processed/cleaned_v2"
lap_path = "hdfs:///bda/f1-telemetry/processed/lap_features"
out = "hdfs:///bda/f1-telemetry/analysis_v2"

telemetry = spark.read.parquet(telemetry_path)
laps = spark.read.parquet(lap_path)

# ============================================================
# 1. FASTEST LAP TELEMETRY
# ============================================================

# Find fastest valid lap for every session + driver
fastest = (
    laps
    .filter(
        (col("lap_time").isNotNull()) &
        (col("lap_time") > 0) &
        (col("is_push_lap") == 1)
    )
    .groupBy("session", "driver")
    .agg(min("lap_time").alias("fastest_lap_time"))
)

# Identify the actual lap number
fastest_laps = (
    laps.alias("l")
    .join(
        fastest.alias("f"),
        (col("l.session") == col("f.session")) &
        (col("l.driver") == col("f.driver")) &
        (col("l.lap_time") == col("f.fastest_lap_time"))
    )
    .select(
        col("l.session"),
        col("l.driver"),
        col("l.lap").alias("fastest_lap"),
        col("l.lap_time").alias("lap_time")
    )
    .dropDuplicates(["session", "driver"])
)

# Get telemetry samples belonging to those laps
fastest_telemetry = (
    telemetry.alias("t")
    .join(
        fastest_laps.alias("f"),
        (col("t.session") == col("f.session")) &
        (col("t.driver") == col("f.driver")) &
        (col("t.lap") == col("f.fastest_lap"))
    )
    .select(
        col("t.session"),
        col("t.driver"),
        col("t.lap"),
        col("t.distance"),
        col("t.x"),
        col("t.y"),
        col("t.speed"),
        col("t.throttle"),
        col("t.brake"),
        col("t.gear"),
        col("t.drs")
    )
)

fastest_telemetry.write.mode("overwrite").parquet(
    out + "/fastest_laps"
)

print("FASTEST LAP TELEMETRY ROWS:", fastest_telemetry.count())


# ============================================================
# 2. RACE POSITION BY LAP
# ============================================================

race_position = (
    laps
    .filter(col("position").isNotNull())
    .select(
        "session",
        "driver",
        "lap",
        "position"
    )
    .dropDuplicates(["session", "driver", "lap"])
    .orderBy("session", "lap", "position")
)

race_position.write.mode("overwrite").parquet(
    out + "/race_position"
)

print("RACE POSITION ROWS:", race_position.count())


# ============================================================
# 3. STINT TABLE
# ============================================================

stints = (
    laps
    .filter(
        (col("stint").isNotNull()) &
        (col("compound").isNotNull()) &
        (col("lap").isNotNull())
    )
    .groupBy("session", "driver", "stint", "compound")
    .agg(
        min("lap").alias("start_lap"),
        max("lap").alias("end_lap"),
        count("*").alias("laps")
    )
    .orderBy("session", "driver", "stint")
)

stints.write.mode("overwrite").parquet(
    out + "/stints"
)

print("STINT ROWS:", stints.count())


# ============================================================
# 4. QUICK VALIDATION
# ============================================================

print("\n=== FASTEST LAP SAMPLE ===")
fastest_telemetry.show(10, False)

print("\n=== RACE POSITION SAMPLE ===")
race_position.show(20, False)

print("\n=== STINT SAMPLE ===")
stints.show(20, False)

spark.stop()
